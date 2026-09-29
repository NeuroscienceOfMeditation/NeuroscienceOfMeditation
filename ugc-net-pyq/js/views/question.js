/* The question card shared by Practice and Review: syllabus tags, the
   question in its NTA format, the options, and after submission the
   verdict, the explanation and the Trend Insight box. */

import { esc, richText, pct, plural, LETTERS, ROMAN } from '../util.js';
import { QUESTION_TYPES, SOURCE_TYPES } from '../data.js';

const ICON = {
  unit: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.5 8 1l6 2.5L8 6 2 3.5Zm0 4L8 10l6-2.5M2 11.5 8 14l6-2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  topic: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="currentColor"/><path d="m6 10.3 2.6 2.6L14.2 7.3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cross: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="currentColor"/><path d="m7 7 6 6m0-6-6 6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
  trend: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 15.5 7.5 10l3 3 7-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 5h4.5v4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export function subjectTag(subject) {
  return `<span class="tag tag-subject"><span class="dot dot-${esc(subject.id)}" aria-hidden="true"></span>${esc(subject.name)} <span class="text-muted">(${esc(subject.code)})</span></span>`;
}

export function syllabusTags(q, subject) {
  return `<div class="flex flex-wrap items-center gap-2">
    ${subjectTag(subject)}
    <span class="tag tag-unit">${ICON.unit}<span class="sr-only">Syllabus unit:</span>${esc(q.macro_unit)}</span>
    <span class="tag tag-topic">${ICON.topic}<span class="sr-only">Micro-topic:</span>${esc(q.micro_topic)}</span>
  </div>`;
}

export function sourceLabel(q) {
  if (q.source.type === 'model') return 'PYQ-pattern model, undated';
  return `${q._session.label} · ${SOURCE_TYPES[q.source.type]}`;
}

function metaLine(q) {
  const note = q.source.note ? ` title="${esc(q.source.note)}"` : '';
  return `<p class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
    <span>${esc(QUESTION_TYPES[q.question_type])}</span>
    <span aria-hidden="true">·</span>
    <span${note}>${esc(sourceLabel(q))}</span>
    <span aria-hidden="true">·</span>
    <span class="font-mono">${esc(q.id)}</span>
  </p>`;
}

function matchTable(lists) {
  const a = lists.list_i.items;
  const b = lists.list_ii.items;
  const rows = Array.from({ length: Math.max(a.length, b.length) }, (_, i) => `<tr>
      <td>${a[i] != null ? `<span class="q-label">${LETTERS[i]}.</span> ${esc(a[i])}` : ''}</td>
      <td>${b[i] != null ? `<span class="q-label">${ROMAN[i]}.</span> ${esc(b[i])}` : ''}</td>
    </tr>`).join('');
  return `<div class="q-table-wrap"><table class="q-table">
    <thead><tr><th scope="col">${esc(lists.list_i.title || 'List I')}</th><th scope="col">${esc(lists.list_ii.title || 'List II')}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

export function questionBody(q, headingId) {
  let html = `<h2 id="${headingId}" class="q-stem" tabindex="-1">${esc(q.question_text)}</h2>`;
  if (q.lists) html += matchTable(q.lists);
  if (q.items) {
    html += '<ol class="q-items">' + q.items.map((t, i) =>
      `<li><span class="q-label">${LETTERS[i]}.</span><span>${esc(t)}</span></li>`).join('') + '</ol>';
  }
  if (q.assertion) {
    html += `<dl class="q-ar">
      <div><dt>Assertion (A)</dt><dd>${esc(q.assertion)}</dd></div>
      <div><dt>Reason (R)</dt><dd>${esc(q.reason)}</dd></div>
    </dl>`;
  }
  if (q.prompt) html += `<p class="q-prompt">${esc(q.prompt)}</p>`;
  return html;
}

export function optionsList(q, st, name) {
  const done = st.submitted;
  return `<fieldset class="options">
    <legend class="sr-only">Choose one answer</legend>
    ${q.options.map((opt, i) => {
      const n = i + 1;
      let cls = '';
      let flag = '';
      if (done && n === q.correct_answer) { cls = 'is-correct'; flag = '<span class="option-flag">Correct answer</span>'; }
      else if (done && n === st.choice) { cls = 'is-wrong'; flag = '<span class="option-flag">Your answer</span>'; }
      else if (done) cls = 'is-dim';
      return `<label class="option ${cls}">
        <input type="radio" name="${name}" value="${n}" data-action="choose"${st.choice === n ? ' checked' : ''}${done ? ' disabled' : ''}>
        <span class="option-num">(${n})</span>
        <span class="option-text">${esc(opt)}</span>
        ${flag}
      </label>`;
    }).join('')}
  </fieldset>`;
}

export function trendInsight(q, freq, subject) {
  let count;
  if (freq.topicDated) {
    count = `This micro-topic appears in <strong>${plural(freq.topicDated, 'dated question')}</strong> across ${plural(freq.sessions.length, 'session')} (${esc(freq.sessions.join(', '))}). Its unit accounts for ${freq.unitDated} of the ${freq.subjectDated} dated ${esc(subject.short)} questions loaded (${pct(freq.unitDated, freq.subjectDated)}%).`;
  } else if (freq.papersLoaded) {
    count = `No question on this micro-topic in the ${plural(freq.papersLoaded, 'dated ' + subject.short + ' session')} loaded. Its unit accounts for ${freq.unitDated} of ${freq.subjectDated} dated questions (${pct(freq.unitDated, freq.subjectDated)}%).`;
  } else {
    count = `No dated ${esc(subject.short)} papers are loaded yet, so there is nothing to count. Once official papers are added to <code>data/${esc(subject.question_files[0])}</code>, this line counts appearances session by session.`;
  }
  const others = freq.topicTotal - 1;
  const drill = others > 0
    ? `<button type="button" class="btn btn-ghost btn-sm mt-4" data-action="drill-topic" data-subject="${esc(q.subject)}" data-topic="${esc(q.micro_topic)}">Practise all ${freq.topicTotal} questions on this micro-topic →</button>`
    : '';
  return `<aside class="insight" aria-labelledby="insight-${esc(q.id)}">
    <div class="insight-head">
      ${ICON.trend}
      <h3 id="insight-${esc(q.id)}">Trend Insight</h3>
      <span class="insight-topic">${esc(q.micro_topic)}</span>
    </div>
    <p class="insight-count"><span class="insight-k">Frequency in loaded papers</span>${count}</p>
    <div class="prose-lite">${richText(q.trend_analysis)}</div>
    ${drill}
  </aside>`;
}

export function verdict(q, st, note) {
  const ok = st.choice === q.correct_answer;
  return `<div class="verdict ${ok ? 'verdict-good' : 'verdict-bad'}" role="status">
    ${ok ? ICON.check : ICON.cross}
    <div>
      <p class="font-semibold">${ok ? 'Correct' : 'Incorrect'}</p>
      <p class="text-sm">${ok
        ? `Option (${q.correct_answer}) is right.`
        : `You chose (${st.choice}). The correct answer is (${q.correct_answer}): ${esc(q.options[q.correct_answer - 1])}.`}</p>
      ${note ? `<p class="mt-1 text-sm">${note}</p>` : ''}
    </div>
  </div>`;
}

export function explanation(q) {
  const refs = q.references && q.references.length
    ? `<p class="mt-3 text-xs text-muted"><span class="font-semibold">Sources:</span> ${q.references.map(esc).join('; ')}</p>`
    : '';
  return `<section class="mt-6" aria-label="Explanation">
    <h3 class="section-kicker">Detailed explanation</h3>
    <div class="prose-lite">${richText(q.detailed_explanation)}</div>
    ${refs}
  </section>`;
}

/**
 * The whole card. `st` is { choice, submitted }; `after` is extra HTML for
 * the footer once submitted (Next buttons and so on).
 */
export function questionCard({ q, subject, st, freq, name, note, actions }) {
  const headingId = 'q-' + name;
  return `<article class="card p-5 sm:p-7" aria-labelledby="${headingId}">
    ${syllabusTags(q, subject)}
    ${metaLine(q)}
    <div class="mt-5">${questionBody(q, headingId)}</div>
    <form class="mt-5" data-action="submit-form" novalidate>
      ${optionsList(q, st, name)}
      ${st.submitted ? '' : `<div class="mt-5 flex flex-wrap items-center gap-3">
        <button type="submit" class="btn btn-primary"${st.choice ? '' : ' disabled'}>Submit answer</button>
        <span class="hidden text-xs text-muted sm:inline">Keys <kbd>1</kbd>–<kbd>${q.options.length}</kbd> choose · <kbd>Enter</kbd> submits</span>
      </div>`}
    </form>
    ${st.submitted ? `<div class="feedback" id="feedback-${name}" tabindex="-1">
      ${verdict(q, st, note)}
      ${explanation(q)}
      ${trendInsight(q, freq, subject)}
      ${actions ? `<div class="mt-6 flex flex-wrap items-center gap-3">${actions}</div>` : ''}
    </div>` : ''}
  </article>`;
}
