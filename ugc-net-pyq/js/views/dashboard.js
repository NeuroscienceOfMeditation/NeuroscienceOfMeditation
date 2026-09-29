/* Analytics: syllabus weightage, the unit × session trend grid, your
   accuracy by unit, and micro-topic frequency. All of it is computed from
   the questions that pass the sidebar filters. */

import { esc, pct, plural } from '../util.js';
import { SOURCE_TYPES } from '../data.js';
import { unitMatrix, unitAccuracy, microTopicStats, summary } from '../analytics.js';

const HEAT_LEVELS = 6;

function tile(label, value, sub) {
  return `<div class="stat">
    <p class="stat-label">${esc(label)}</p>
    <p class="stat-value">${value}</p>
    <p class="stat-sub">${sub}</p>
  </div>`;
}

function chartCard(title, subtitle, body, id) {
  return `<section class="card p-5 sm:p-6" aria-labelledby="${id}">
    <h2 id="${id}" class="text-base font-semibold">${esc(title)}</h2>
    ${subtitle ? `<p class="mt-1 text-sm text-ink-2">${subtitle}</p>` : ''}
    <div class="mt-5">${body}</div>
  </section>`;
}

function barRow({ label, short, value, max, display, tip }) {
  const w = max ? (value / max) * 100 : 0;
  return `<div class="bar-row" tabindex="0" data-tip="${esc(tip)}" aria-label="${esc(label)}: ${esc(display)}">
    <span class="bar-label" title="${esc(label)}">${esc(short)}</span>
    <span class="bar-track">${value ? `<span class="bar" style="width:${w}%"></span>` : ''}<span class="bar-value">${esc(display)}</span></span>
  </div>`;
}

function weightageChart(matrix, total) {
  const max = Math.max(1, ...matrix.groups.flatMap((g) => g.rows.map((r) => r.total)));
  return matrix.groups.map((g) => `<div class="bar-group">
    ${matrix.groups.length > 1 ? `<p class="bar-group-title"><span class="dot dot-${esc(g.subject.id)}" aria-hidden="true"></span>${esc(g.subject.name)}</p>` : ''}
    ${g.rows.map((r) => barRow({
      label: r.label,
      short: `Unit ${r.no}: ${r.title}`,
      value: r.total,
      max,
      display: String(r.total),
      tip: `${r.label}\n${plural(r.total, 'question')} (${pct(r.total, total)}% of this view)\n${r.dated} from dated papers`,
    })).join('')}
  </div>`).join('');
}

function heatLevel(n, max) {
  return n ? Math.max(1, Math.ceil((n / max) * HEAT_LEVELS)) : 0;
}

function heatmap(matrix) {
  const { columns, groups, max } = matrix;
  if (!columns.length) return '<p class="text-sm text-ink-2">No questions in view.</p>';
  const head = columns.map((c) => `<th scope="col">${esc(c.label)}</th>`).join('');
  const body = groups.map((g) => `
    ${groups.length > 1 ? `<tr class="heat-group"><th scope="rowgroup" colspan="${columns.length + 1}"><span class="dot dot-${esc(g.subject.id)}" aria-hidden="true"></span>${esc(g.subject.name)}</th></tr>` : ''}
    ${g.rows.map((r) => `<tr>
      <th scope="row" title="${esc(r.label)}">Unit ${r.no}: ${esc(r.title)}</th>
      ${columns.map((c) => {
        const n = r.cells[c.key] || 0;
        return `<td class="heat heat-${heatLevel(n, max)}" data-tip="${esc(`${r.label}\n${c.label}: ${plural(n, 'question')}`)}">${n || '<span aria-hidden="true">·</span><span class="sr-only">0</span>'}</td>`;
      }).join('')}
    </tr>`).join('')}`).join('');
  const legend = `<div class="heat-legend" aria-hidden="true">
    <span>fewer</span>
    ${Array.from({ length: HEAT_LEVELS }, (_, i) => `<span class="heat heat-${i + 1}"></span>`).join('')}
    <span>more (max ${max})</span>
  </div>`;
  return `<div class="table-wrap"><table class="heat-table">
      <caption class="sr-only">Questions per syllabus unit in each exam session</caption>
      <thead><tr><th scope="col">Unit</th>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table></div>${legend}`;
}

function accuracyChart(rows) {
  if (!rows.length) {
    return '<p class="text-sm text-ink-2">Answer a few questions in Practice to see where you are strong and where you are losing marks.</p>';
  }
  return rows.map((r) => barRow({
    label: r.label,
    short: `${r.subject.short} ${r.no}: ${r.title}`,
    value: pct(r.correct, r.attempts),
    max: 100,
    display: `${pct(r.correct, r.attempts)}%`,
    tip: `${r.label}\n${r.correct} correct of ${plural(r.attempts, 'attempt')} on ${plural(r.answered, 'question')}`,
  })).join('');
}

function topicTable(topics, subjects) {
  if (!topics.length) return '<p class="text-sm text-ink-2">No questions in view.</p>';
  const rows = topics.map((t) => `<tr>
    <td><span class="dot dot-${esc(t.subject)}" aria-hidden="true"></span> <span class="font-medium">${esc(t.topic)}</span><div class="text-xs text-muted">${esc(t.unit)}</div></td>
    <td class="num">${t.count}</td>
    <td class="num">${t.dated}</td>
    <td class="text-xs">${t.sessions.length ? esc(t.sessions.join(', ')) : '<span class="text-muted">None loaded</span>'}</td>
    <td class="num">${t.attempts ? pct(t.correct, t.attempts) + '%' : '<span class="text-muted">—</span>'}</td>
    <td><button type="button" class="btn btn-ghost btn-sm whitespace-nowrap" data-action="drill-topic" data-subject="${esc(t.subject)}" data-topic="${esc(t.topic)}" aria-label="Practise ${esc(t.topic)}">Practise</button></td>
  </tr>`).join('');
  return `<div class="table-wrap"><table class="data-table">
    <caption class="sr-only">Micro-topics with question counts, sessions and your accuracy</caption>
    <thead><tr>
      <th scope="col">Micro-topic</th><th scope="col" class="num">In bank</th><th scope="col" class="num">Dated PYQs</th>
      <th scope="col">Sessions</th><th scope="col" class="num">Your accuracy</th><th scope="col"><span class="sr-only">Action</span></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function aboutData(bank, questions) {
  const bySource = Object.keys(SOURCE_TYPES).map((k) => [k, questions.filter((q) => q.source.type === k).length]);
  const label = {
    official: ['question from official NTA papers', 'questions from official NTA papers'],
    memory_based: ['memory-based PYQ', 'memory-based PYQs'],
    model: ['PYQ-pattern model question', 'PYQ-pattern model questions'],
  };
  return `<section class="card p-5 text-sm text-ink-2 sm:p-6" aria-labelledby="about-h">
    <h2 id="about-h" class="text-base font-semibold text-ink">About this data</h2>
    <ul class="mt-3 space-y-1">
      ${bySource.map(([k, n]) => `<li><strong class="text-ink">${n}</strong> ${esc(label[k][n === 1 ? 0 : 1])}</li>`).join('')}
    </ul>
    <p class="mt-3">Frequencies and trends on this page are counted from the dated papers loaded in <code>data/</code>. PYQ-pattern model questions are for practice and are never counted as exam appearances.</p>
    <p class="mt-3">${esc(bank.syllabus.syllabus_note)}</p>
  </section>`;
}

export function dashboardView({ bank, questions, progress, subject, now }) {
  const s = summary(questions, progress, now);
  const matrix = unitMatrix(bank.syllabus, questions, subject);
  const units = matrix.groups.reduce((n, g) => n + g.rows.filter((r) => r.total).length, 0);

  const noDated = !s.dated
    ? `<p class="notice notice-info text-sm"><strong>No dated papers are loaded yet.</strong> The ${plural(s.total, 'question')} in view ${s.total === 1 ? 'is a' : 'are'} PYQ-pattern ${s.total === 1 ? 'sample' : 'samples'}, so the trend grid shows a single "Undated" column. Add official papers (with <code>exam_year</code> and <code>exam_cycle</code>) and the grid fills in session by session.</p>`
    : '';

  return `<div class="space-y-5">
    ${noDated}
    <div class="stat-row">
      ${tile('Questions in view', String(s.total), `${s.dated} dated · ${s.total - s.dated} undated`)}
      ${tile('Micro-topics', String(s.topics), `across ${plural(units, 'syllabus unit')}`)}
      ${tile('Your accuracy', s.accuracy == null ? '—' : s.accuracy + '%', s.attempts ? `${s.correct} correct of ${plural(s.attempts, 'attempt')}` : 'nothing answered yet')}
      ${tile('Due for review', String(s.due), `${s.inBook} in mistake book · ${s.mastered} retired`)}
    </div>
    ${chartCard('Questions per syllabus unit', 'How the questions in view spread over the syllabus. With dated papers loaded, this is the exam’s unit weightage.', weightageChart(matrix, s.total), 'weight-h')}
    ${chartCard('Unit × exam session', 'Each cell counts questions from one unit in one session: read across a row to see whether a unit is rising or fading.', heatmap(matrix), 'heat-h')}
    <div class="grid gap-5 xl:grid-cols-2">
      ${chartCard('Your accuracy by unit', 'Share of your attempts answered correctly, for units you have practised.', accuracyChart(unitAccuracy(bank.syllabus, questions, progress, subject)), 'acc-h')}
      ${aboutData(bank, questions)}
    </div>
    ${chartCard('Micro-topic frequency', 'Most frequently examined first. Select Practise to drill a single micro-topic.', topicTable(microTopicStats(questions, progress)), 'topics-h')}
  </div>`;
}
