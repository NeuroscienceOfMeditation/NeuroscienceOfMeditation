// Run with: npm test (Node 18+). Covers the pure modules; no browser needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { validateBank, unitLabel } from '../js/data.js';
import { recordAnswer, promote, reviewIds, startSession, answerInSession, sessionDone, emptyProgress, INTERVAL_DAYS } from '../js/srs.js';
import { applyFilters, DEFAULT_FILTERS, sessionOptions, reconcile } from '../js/filters.js';
import { topicFrequency, unitMatrix, microTopicStats } from '../js/analytics.js';
import { richText, fold } from '../js/util.js';
import { sanitizeProgress } from '../js/store.js';

const read = (f) => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const syllabus = read('syllabus.json');
const shipped = syllabus.subjects.flatMap((s) => s.question_files.flatMap((f) => read(f).map((q) => ({ q, file: f }))));

const DAY = 86400000;
const NOW = new Date(2026, 8, 29, 10, 0, 0).getTime();

function dated(id, year, cycle, overrides = {}) {
  return {
    id, subject: 'yoga', exam_year: year, exam_cycle: cycle,
    question_type: 'mcq', question_text: 'Q?', options: ['a', 'b', 'c', 'd'], correct_answer: 1,
    detailed_explanation: 'x', macro_unit: 'Yoga Unit 4: Patanjala Yoga Sutra',
    micro_topic: 'Kleshas and their removal', trend_analysis: 'y', ...overrides,
  };
}

test('every shipped question passes the data check', () => {
  const bank = validateBank(syllabus, shipped);
  assert.deepEqual(bank.problems, []);
  assert.equal(bank.questions.length, 4);
  for (const q of bank.questions) {
    assert.ok(q.macro_unit && q.micro_topic && q.trend_analysis && q.detailed_explanation);
    assert.equal(q.source.type, 'model');
  }
});

test('shipped macro_unit labels follow the "Yoga Unit 4: …" pattern', () => {
  const yoga = syllabus.subjects[0];
  assert.equal(unitLabel(yoga, yoga.units[3]), 'Yoga Unit 4: Patanjala Yoga Sutra');
  const iks = syllabus.subjects[1];
  assert.equal(unitLabel(iks, iks.units[2]), 'IKS Unit 3: Astronomy');
});

test('data check rejects malformed questions with a readable reason', () => {
  const bad = [
    dated('A', 2025, 'June', { correct_answer: 5 }),
    dated('B', 2025, 'June', { macro_unit: 'Yoga Unit 11: Nope' }),
    dated('C', 2025, 'June', { macro_unit: 'IKS Unit 3: Astronomy' }),
    dated('D', 2025, 'Jan'),
    dated('E', null, null, { exam_year: null, exam_cycle: null, source: { type: 'official' } }),
    dated('F', 2025, 'June', { source: { type: 'model' } }),
    dated('G', 2025, 'June', { question_type: 'match' }),
    dated('H', 2025, 'June'),
    dated('H', 2025, 'June'),
  ];
  const bank = validateBank(syllabus, bad.map((q) => ({ q, file: 't.json' })));
  const why = Object.fromEntries(bank.problems.map((p) => [p.id, p.errors.join(' | ')]));
  assert.match(why.A, /correct_answer/);
  assert.match(why.B, /does not match a unit/);
  assert.match(why.C, /belongs to Indian Knowledge System/);
  assert.match(why.D, /June" or "December/);
  assert.match(why.E, /needs exam_year/);
  assert.match(why.F, /model question cannot carry/);
  assert.match(why.G, /list_i/);
  assert.match(why.H, /duplicate id/);
  assert.deepEqual(bank.questions.map((q) => q.id), ['H']);
});

test('a wrong answer enters the mistake book due now; a right one does not', () => {
  let p = recordAnswer(emptyProgress(), 'Q1', true, NOW);
  assert.equal(p.srs.Q1, undefined);
  p = recordAnswer(p, 'Q1', false, NOW);
  assert.deepEqual(p.srs.Q1, { box: 0, due: NOW, lapses: 1, since: NOW });
  assert.deepEqual(p.attempts.Q1, { n: 2, correct: 1, last: false, at: NOW });
});

test('clearing a card spaces it 1, 3, 7 days, then retires it', () => {
  let p = recordAnswer(emptyProgress(), 'Q1', false, NOW);
  const gaps = [];
  let t = NOW;
  for (let i = 1; i < INTERVAL_DAYS.length; i++) {
    p = promote(p, 'Q1', t);
    gaps.push(Math.round((p.srs.Q1.due - new Date(t).setHours(0, 0, 0, 0)) / DAY));
    t = p.srs.Q1.due;
  }
  assert.deepEqual(gaps, [1, 3, 7]);
  p = promote(p, 'Q1', t);
  assert.equal(p.srs.Q1, undefined);
  assert.equal(p.mastered.Q1, t);
});

test('a miss at any stage resets the card and un-retires it', () => {
  let p = recordAnswer(emptyProgress(), 'Q1', false, NOW);
  p = promote(promote(p, 'Q1', NOW), 'Q1', NOW);
  assert.equal(p.srs.Q1.box, 2);
  p = recordAnswer(p, 'Q1', false, NOW + DAY);
  assert.equal(p.srs.Q1.box, 0);
  assert.equal(p.srs.Q1.lapses, 2);
  p = { ...p, srs: {}, mastered: { Q1: NOW } };
  p = recordAnswer(p, 'Q1', false, NOW);
  assert.equal(p.mastered.Q1, undefined);
});

test('reviewIds returns due cards, most overdue first, and all cards when asked', () => {
  let p = emptyProgress();
  p = recordAnswer(p, 'late', false, NOW - 2 * DAY);
  p = recordAnswer(p, 'early', false, NOW - DAY);
  p = promote(recordAnswer(p, 'future', false, NOW), 'future', NOW);
  assert.deepEqual(reviewIds(p, ['early', 'future', 'late', 'other'], NOW), ['late', 'early']);
  assert.deepEqual(reviewIds(p, ['early', 'future', 'late'], NOW, true), ['late', 'early', 'future']);
});

test('the review loop only ends once every question is answered correctly', () => {
  let s = startSession(['a', 'b', 'c', 'd', 'e']);
  s = answerInSession(s, false); // a missed: back after 3 others
  assert.deepEqual(s.queue, ['b', 'c', 'd', 'a', 'e']);
  s = answerInSession(s, true); // b
  s = answerInSession(s, true); // c
  s = answerInSession(s, true); // d
  assert.equal(s.queue[0], 'a');
  s = answerInSession(s, false); // a missed again, fewer than 3 left behind it
  assert.deepEqual(s.queue, ['e', 'a']);
  s = answerInSession(s, true); // e
  s = answerInSession(s, false); // a, alone: comes straight back
  assert.deepEqual(s.queue, ['a']);
  assert.equal(sessionDone(s), false);
  s = answerInSession(s, true);
  assert.equal(sessionDone(s), true);
  assert.deepEqual(s.cleared, ['b', 'c', 'd', 'e', 'a']);
  assert.equal(s.firstTry, 4);
  assert.equal(s.tries.a, 4);
});

test('filters by subject, year, session, unit, topic, status and search', () => {
  const qs = [
    dated('Y1', 2025, 'June'),
    dated('Y2', 2024, 'December', { macro_unit: 'Yoga Unit 5: Hatha Yoga Texts', micro_topic: 'Shatkarma' }),
    dated('I1', 2025, 'December', { subject: 'iks', macro_unit: 'IKS Unit 6: Mathematics', micro_topic: 'Kerala School of Mathematics', question_text: 'Who wrote the Yuktibhāṣā?' }),
  ];
  const bank = validateBank(syllabus, qs.map((q) => ({ q, file: 't' })));
  const p = recordAnswer(emptyProgress(), 'Y1', false, NOW);
  const ids = (f) => applyFilters(bank.questions, { ...DEFAULT_FILTERS, ...f }, p).map((q) => q.id);
  assert.deepEqual(ids({ subject: 'iks' }), ['I1']);
  assert.deepEqual(ids({ session: '2025' }).sort(), ['I1', 'Y1']);
  assert.deepEqual(ids({ session: '2024-December' }), ['Y2']);
  assert.deepEqual(ids({ unit: 'yoga-5' }), ['Y2']);
  assert.deepEqual(ids({ topic: 'Kleshas and their removal' }), ['Y1']);
  assert.deepEqual(ids({ status: 'unattempted' }).sort(), ['I1', 'Y2']);
  assert.deepEqual(ids({ status: 'mistakes' }), ['Y1']);
  assert.deepEqual(ids({ q: 'yuktibhasha' }), ['I1']);

  const opts = sessionOptions(bank.questions);
  assert.deepEqual(opts.years.map((y) => y.year), [2025, 2024]);
  assert.deepEqual(opts.years[0].sessions.map((s) => s.label), ['December 2025', 'June 2025']);

  assert.equal(reconcile({ ...DEFAULT_FILTERS, subject: 'iks', unit: 'yoga-4' }, bank.questions).unit, 'all');
});

test('trend frequency counts only dated papers', () => {
  const qs = [
    dated('A', 2023, 'June'),
    dated('B', 2025, 'June'),
    dated('C', 2025, 'June', { micro_topic: 'Other topic' }),
    dated('D', 2024, 'June', { macro_unit: 'Yoga Unit 5: Hatha Yoga Texts', micro_topic: 'Shatkarma' }),
    { ...dated('M', null, null), exam_year: null, exam_cycle: null },
  ];
  const bank = validateBank(syllabus, qs.map((q) => ({ q, file: 't' })));
  const byId = new Map(bank.questions.map((q) => [q.id, q]));
  const f = topicFrequency(bank.questions, byId.get('A'));
  assert.equal(f.topicDated, 2);
  assert.equal(f.topicTotal, 3);
  assert.deepEqual(f.sessions, ['June 2023', 'June 2025']);
  assert.equal(f.unitDated, 3);
  assert.equal(f.subjectDated, 4);
  assert.equal(f.papersLoaded, 3);

  const m = unitMatrix(syllabus, bank.questions, 'yoga');
  assert.deepEqual(m.columns.map((c) => c.label), ['June 2023', 'June 2024', 'June 2025', 'Undated']);
  const unit4 = m.groups[0].rows.find((r) => r.no === 4);
  assert.deepEqual(unit4.cells, { '2023-June': 1, '2025-June': 2, undated: 1 });
  assert.equal(m.max, 2);

  const topics = microTopicStats(bank.questions, emptyProgress());
  assert.equal(topics[0].topic, 'Kleshas and their removal');
  assert.equal(topics[0].dated, 2);
});

test('richText escapes HTML and supports paragraphs, bullets and bold', () => {
  const html = richText('**Bold** <script>\n\n- one\n- two');
  assert.equal(html, '<p><strong>Bold</strong> &lt;script&gt;</p><ul><li>one</li><li>two</li></ul>');
});

test('search folding matches IAST and plain spellings', () => {
  assert.ok(fold('Kleśas and Āryabhaṭa').includes(fold('kleshas')));
  assert.ok(fold('Āryabhaṭīya').includes(fold('aryabhatiya')));
  assert.ok(fold('prakṛti').includes(fold('prakriti')));
});

test('imported progress is sanitised', () => {
  const p = sanitizeProgress({ attempts: { a: { n: 2, correct: 1, last: false, at: 5 }, b: 'junk' }, srs: { a: { box: 9, due: 10, lapses: 2 } }, mastered: { c: 'x' } });
  assert.deepEqual(Object.keys(p.attempts), ['a']);
  assert.equal(p.srs.a.box, 3);
  assert.deepEqual(p.mastered, {});
  assert.deepEqual(sanitizeProgress(null), emptyProgress());
});
