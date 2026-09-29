/* Aggregations behind the Analytics view and the computed line in each
   Trend Insight box. Counts only ever come from the loaded questions, so
   the frequency figures are exact for whatever papers are in data/. */

import { unitOptions } from './filters.js';

/** Dated exam sessions present in `questions`, oldest first. */
export function datedSessions(questions) {
  const map = new Map();
  for (const q of questions) {
    if (q._session.year != null) map.set(q._session.key, q._session);
  }
  return [...map.values()].sort((a, b) => a.order - b.order);
}

/** Unit × session counts for the heatmap and the unit-weightage bars. */
export function unitMatrix(syllabus, questions, subject) {
  const columns = datedSessions(questions);
  const undated = questions.filter((q) => q._session.year == null).length;
  if (undated) columns.push({ key: 'undated', label: 'Undated', year: null });

  let max = 0;
  const groups = unitOptions(syllabus, questions, subject).map(({ subject: s, units }) => ({
    subject: s,
    rows: units.map((u) => {
      const cells = {};
      let dated = 0;
      for (const q of questions) {
        if (q._unitKey !== u.key) continue;
        cells[q._session.key] = (cells[q._session.key] || 0) + 1;
        if (q._session.year != null) dated++;
      }
      for (const c of columns) max = Math.max(max, cells[c.key] || 0);
      return { ...u, total: u.count, dated, cells };
    }),
  }));
  return { columns, groups, max };
}

function tally(progress, ids) {
  let attempts = 0;
  let correct = 0;
  let answered = 0;
  for (const id of ids) {
    const a = progress.attempts[id];
    if (!a) continue;
    answered++;
    attempts += a.n;
    correct += a.correct;
  }
  return { attempts, correct, answered };
}

export function unitAccuracy(syllabus, questions, progress, subject) {
  return unitOptions(syllabus, questions, subject).flatMap(({ subject: s, units }) => units.map((u) => {
    const ids = questions.filter((q) => q._unitKey === u.key).map((q) => q.id);
    return { subject: s, ...u, ...tally(progress, ids) };
  })).filter((u) => u.attempts > 0);
}

export function microTopicStats(questions, progress) {
  const map = new Map();
  for (const q of questions) {
    const key = q.subject + '\u0000' + q.micro_topic;
    if (!map.has(key)) {
      map.set(key, { topic: q.micro_topic, subject: q.subject, unit: q.macro_unit, unitKey: q._unitKey, count: 0, dated: 0, sessions: new Map(), ids: [] });
    }
    const t = map.get(key);
    t.count++;
    t.ids.push(q.id);
    if (q._session.year != null) {
      t.dated++;
      t.sessions.set(q._session.key, q._session);
    }
  }
  return [...map.values()]
    .map((t) => ({
      ...t,
      sessions: [...t.sessions.values()].sort((a, b) => a.order - b.order).map((s) => s.label),
      ...tally(progress, t.ids),
    }))
    .sort((a, b) => b.dated - a.dated || b.count - a.count || a.topic.localeCompare(b.topic));
}

/** The computed half of a Trend Insight: how often this micro-topic and its unit appear in dated papers. */
export function topicFrequency(questions, q) {
  const subjectQs = questions.filter((x) => x.subject === q.subject);
  const dated = subjectQs.filter((x) => x._session.year != null);
  const sameTopic = subjectQs.filter((x) => x.micro_topic === q.micro_topic);
  const topicDated = sameTopic.filter((x) => x._session.year != null);
  const sessions = datedSessions(topicDated).map((s) => s.label);
  return {
    papersLoaded: datedSessions(dated).length,
    subjectDated: dated.length,
    unitDated: dated.filter((x) => x._unitKey === q._unitKey).length,
    topicDated: topicDated.length,
    topicTotal: sameTopic.length,
    sessions,
  };
}

export function summary(questions, progress, now) {
  const ids = questions.map((q) => q.id);
  const t = tally(progress, ids);
  const inBook = ids.filter((id) => progress.srs[id]);
  return {
    total: questions.length,
    dated: questions.filter((q) => q._session.year != null).length,
    sessions: datedSessions(questions).length,
    topics: new Set(questions.map((q) => q.subject + '\u0000' + q.micro_topic)).size,
    ...t,
    accuracy: t.attempts ? Math.round((t.correct / t.attempts) * 100) : null,
    inBook: inBook.length,
    due: inBook.filter((id) => progress.srs[id].due <= now).length,
    mastered: ids.filter((id) => progress.mastered[id]).length,
  };
}
