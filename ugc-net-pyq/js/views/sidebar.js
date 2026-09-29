/* The filter panel. It scopes every view: Practice, Review and Analytics. */

import { esc, plural } from '../util.js';
import { QUESTION_TYPES } from '../data.js';
import { STATUS_OPTIONS, sessionOptions, unitOptions, topicOptions, isFiltered } from '../filters.js';

function option(value, label, selected, disabled) {
  return `<option value="${esc(value)}"${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}>${esc(label)}</option>`;
}

function subjectSwitch(syllabus, f) {
  const choices = [{ id: 'all', label: 'Both' }, ...syllabus.subjects.map((s) => ({ id: s.id, label: s.short, dot: s.id }))];
  return `<fieldset>
    <legend class="field-label">Subject</legend>
    <div class="segmented" role="radiogroup">
      ${choices.map((c) => `<label class="segmented-item">
        <input type="radio" name="f-subject" value="${esc(c.id)}" data-filter="subject"${f.subject === c.id ? ' checked' : ''}>
        <span>${c.dot ? `<span class="dot dot-${esc(c.dot)}" aria-hidden="true"></span>` : ''}${esc(c.label)}</span>
      </label>`).join('')}
    </div>
  </fieldset>`;
}

function sessionSelect(questions, f) {
  const { years, undated } = sessionOptions(questions);
  let html = option('all', 'All years and sessions', f.session === 'all');
  for (const y of years) {
    html += `<optgroup label="${y.year}">`;
    html += option(String(y.year), `All of ${y.year} (${y.count})`, f.session === String(y.year));
    for (const s of y.sessions) html += option(s.key, `${s.label} (${s.count})`, f.session === s.key);
    html += '</optgroup>';
  }
  if (undated) html += option('undated', `Undated / PYQ-pattern (${undated})`, f.session === 'undated');
  return `<label class="block">
    <span class="field-label">Exam year / session</span>
    <select class="select" data-filter="session">${html}</select>
    ${years.length ? '' : '<span class="field-hint">No dated papers loaded yet. Add them in data/ to filter by year.</span>'}
  </label>`;
}

function unitSelect(syllabus, questions, f) {
  const groups = unitOptions(syllabus, questions, f.subject);
  let html = option('all', 'All syllabus units', f.unit === 'all');
  for (const g of groups) {
    html += `<optgroup label="${esc(g.subject.name)} (${esc(g.subject.code)})">`;
    for (const u of g.units) html += option(u.key, `${u.label} (${u.count})`, f.unit === u.key, u.count === 0 && f.unit !== u.key);
    html += '</optgroup>';
  }
  return `<label class="block">
    <span class="field-label">Syllabus unit</span>
    <select class="select" data-filter="unit">${html}</select>
  </label>`;
}

function topicSelect(questions, f) {
  const topics = topicOptions(questions, f);
  const html = option('all', topics.length ? `All micro-topics (${topics.length})` : 'No micro-topics', f.topic === 'all') +
    topics.map((t) => option(t.topic, `${t.topic} (${t.count})`, f.topic === t.topic)).join('');
  return `<label class="block">
    <span class="field-label">Micro-topic</span>
    <select class="select" data-filter="topic"${topics.length ? '' : ' disabled'}>${html}</select>
  </label>`;
}

function typeSelect(f) {
  const html = option('all', 'All formats', f.type === 'all') +
    Object.entries(QUESTION_TYPES).map(([k, v]) => option(k, v, f.type === k)).join('');
  return `<label class="block">
    <span class="field-label">Question format</span>
    <select class="select" data-filter="type">${html}</select>
  </label>`;
}

function statusSelect(f) {
  const html = Object.entries(STATUS_OPTIONS).map(([k, v]) => option(k, v, f.status === k)).join('');
  return `<label class="block">
    <span class="field-label">Show</span>
    <select class="select" data-filter="status">${html}</select>
  </label>`;
}

export function sidebarView({ bank, filters: f, matchCount, stats, storageOk }) {
  const { syllabus, questions, problems } = bank;
  const dataCheck = problems.length
    ? `<details class="notice notice-warn mt-4">
        <summary>${plural(problems.length, 'question')} skipped by the data check</summary>
        <ul class="mt-2 space-y-2 text-xs">${problems.map((p) => `<li><span class="font-mono">${esc(p.id)}</span> in ${esc(p.file)}: ${p.errors.map(esc).join('; ')}</li>`).join('')}</ul>
      </details>`
    : `<p class="mt-4 text-xs text-muted">Data check: all ${questions.length} questions passed.</p>`;

  return `<div class="space-y-5">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-ink-2">Filters</h2>
      ${isFiltered(f) ? '<button type="button" class="link text-sm" data-action="reset-filters">Reset</button>' : ''}
    </div>
    ${subjectSwitch(syllabus, f)}
    ${sessionSelect(questions, f)}
    ${unitSelect(syllabus, questions, f)}
    ${topicSelect(questions, f)}
    ${typeSelect(f)}
    ${statusSelect(f)}
    <label class="block">
      <span class="field-label">Search questions</span>
      <input type="search" class="input" data-filter="q" value="${esc(f.q)}" placeholder="e.g. klesha, Madhava, nauli" autocomplete="off">
    </label>
    <p class="rounded-lg bg-surface-2 px-3 py-2 text-sm" aria-live="polite"><strong>${matchCount}</strong> of ${questions.length} questions match</p>

    <section class="border-t border-line pt-5" aria-labelledby="progress-h">
      <h2 id="progress-h" class="text-sm font-semibold uppercase tracking-wide text-ink-2">Your progress</h2>
      <dl class="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div><dt class="text-muted">Answered</dt><dd class="font-semibold">${stats.answered} of ${stats.total}</dd></div>
        <div><dt class="text-muted">Accuracy</dt><dd class="font-semibold">${stats.accuracy == null ? '—' : stats.accuracy + '%'}</dd></div>
        <div><dt class="text-muted">Mistake book</dt><dd class="font-semibold">${stats.inBook}</dd></div>
        <div><dt class="text-muted">Due now</dt><dd class="font-semibold">${stats.due}</dd></div>
      </dl>
      ${storageOk ? '' : '<p class="notice notice-warn mt-3 text-xs">This browser is blocking storage, so progress lasts only while this tab is open.</p>'}
      <div class="mt-4 flex flex-wrap gap-2">
        <button type="button" class="btn btn-ghost btn-sm" data-action="export-progress">Export progress</button>
        <label class="btn btn-ghost btn-sm cursor-pointer">Import<input type="file" accept="application/json,.json" class="sr-only" data-action="import-progress"></label>
        <button type="button" class="btn btn-ghost btn-sm text-bad-ink" data-action="reset-progress">Reset</button>
      </div>
      ${dataCheck}
    </section>
  </div>`;
}
