/* Review mistakes: the spaced-repetition loop over the mistake book. */

import { esc, plural, fmtDay } from '../util.js';
import { INTERVAL_DAYS } from '../srs.js';
import { questionCard } from './question.js';

const BOX_LABEL = ['Relearn now', '1-day check', '3-day check', '7-day check'];

function bookTable(items, byId, now) {
  if (!items.length) return '';
  const rows = items.map(({ id, card }) => {
    const q = byId.get(id);
    const due = card.due <= now ? '<span class="font-semibold">Due now</span>' : esc(fmtDay(card.due));
    return `<tr>
      <td><span class="dot dot-${esc(q.subject)}" aria-hidden="true"></span> ${esc(q.micro_topic)}<div class="text-xs text-muted">${esc(q.macro_unit)}</div></td>
      <td class="whitespace-nowrap">${BOX_LABEL[card.box]}</td>
      <td class="whitespace-nowrap">${due}</td>
      <td class="num">${card.lapses}</td>
    </tr>`;
  }).join('');
  return `<div class="table-wrap mt-6"><table class="data-table">
    <caption class="sr-only">Questions in your mistake book</caption>
    <thead><tr><th scope="col">Question</th><th scope="col">Stage</th><th scope="col">Next review</th><th scope="col" class="num">Times missed</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

export function reviewHome({ progress, visibleIds, hiddenCount, byId, now }) {
  const items = visibleIds.filter((id) => progress.srs[id])
    .map((id) => ({ id, card: progress.srs[id] }))
    .sort((a, b) => a.card.due - b.card.due);
  const due = items.filter((i) => i.card.due <= now).length;
  const later = items.length - due;
  const mastered = visibleIds.filter((id) => progress.mastered[id]).length;
  const boxes = [0, 1, 2, 3].map((b) => items.filter((i) => i.card.box === b).length);
  const next = items.find((i) => i.card.due > now);

  let lead;
  if (!items.length) {
    lead = `<p class="text-lg font-semibold">${mastered ? 'Mistake book clear.' : 'No mistakes yet.'}</p>
      <p class="mt-2 text-ink-2">Any question you get wrong in Practice lands here automatically${mastered ? `. ${plural(mastered, 'question')} retired after four spaced reviews.` : '.'}</p>
      <button type="button" class="btn btn-primary mt-5" data-action="goto" data-view="practice">Go to Practice</button>`;
  } else if (due) {
    lead = `<p class="text-lg font-semibold">${plural(due, 'question')} due for review</p>
      <p class="mt-2 text-ink-2">The loop repeats anything you miss until every question in it is answered correctly.</p>
      <div class="mt-5 flex flex-wrap gap-3">
        <button type="button" class="btn btn-primary" data-action="start-review">Start review (${due})</button>
        ${later ? `<button type="button" class="btn btn-ghost" data-action="start-review" data-all="1">Review all ${items.length} now</button>` : ''}
      </div>`;
  } else {
    lead = `<p class="text-lg font-semibold">Nothing due right now</p>
      <p class="mt-2 text-ink-2">Next review: ${esc(fmtDay(next.card.due))}. Waiting is what makes the spacing work, but you can cram before an exam.</p>
      <button type="button" class="btn btn-ghost mt-5" data-action="start-review" data-all="1">Review all ${items.length} now</button>`;
  }

  return `<div class="space-y-4">
    <div class="card p-6 sm:p-8">
      <h2 class="text-xl font-semibold">Review mistakes</h2>
      <div class="mt-4">${lead}</div>
      ${hiddenCount ? `<p class="notice notice-info mt-5 text-sm">${plural(hiddenCount, 'more question')} in your mistake book ${hiddenCount === 1 ? 'is' : 'are'} hidden by the current filters. <button type="button" class="link" data-action="reset-filters">Reset filters</button></p>` : ''}
      ${items.length ? `<dl class="stage-strip mt-6">${boxes.map((c, b) => `<div><dt>${BOX_LABEL[b]}</dt><dd>${c}</dd></div>`).join('')}<div><dt>Retired</dt><dd>${mastered}</dd></div></dl>` : ''}
      ${bookTable(items, byId, now)}
    </div>
    <details class="card p-5 text-sm text-ink-2">
      <summary class="cursor-pointer font-semibold text-ink">How the spacing works</summary>
      <ol class="mt-3 list-decimal space-y-1 pl-5">
        <li>A wrong answer anywhere puts the question in your mistake book, due at once.</li>
        <li>In a review loop, a question you miss comes back after ${plural(3, 'other question')} (or sooner if fewer are left). The loop ends only when every question in it has been answered correctly: 100%.</li>
        <li>Each correct review pushes the next check further out: ${INTERVAL_DAYS.slice(1).join(', ')} days. Clear the 7-day check and the question retires.</li>
        <li>Miss it at any stage and it drops back to the start.</li>
      </ol>
      <p class="mt-3">Progress is stored in this browser only. Use <em>Export progress</em> in the sidebar to move it to another device.</p>
    </details>
  </div>`;
}

export function reviewSession({ session, q, subject, st, freq, card }) {
  const cleared = session.cleared.length;
  const left = session.queue.length;
  const attempt = (session.tries[q.id] || 0) + (st.submitted ? 0 : 1);
  let note = '';
  if (st.submitted) {
    note = st.choice === q.correct_answer
      ? (card ? `Cleared for now. Next check: <strong>${esc(fmtDay(card.due))}</strong>.` : 'Cleared its last spaced check. This question is <strong>retired</strong>.')
      : `Not yet. It stays in this loop and comes back ${session.queue.length > 1 ? 'after a few other questions' : 'straight away'}.`;
  }
  const actions = session.queue.length
    ? '<button type="button" class="btn btn-primary" data-action="review-next">Next in loop →</button>'
    : '<button type="button" class="btn btn-primary" data-action="review-next">Finish loop</button>';

  return `<div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <p class="text-sm font-medium" aria-live="polite">Review loop · ${cleared} of ${session.total} cleared · ${plural(left, 'question')} left${attempt > 1 ? ` · attempt ${attempt} on this one` : ''}</p>
      <div class="progress flex-1" role="progressbar" aria-label="Questions cleared in this loop" aria-valuemin="0" aria-valuemax="${session.total}" aria-valuenow="${cleared}">
        <span style="width:${(cleared / session.total) * 100}%"></span>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-action="end-review">End loop</button>
    </div>
    ${questionCard({ q, subject, st, freq, name: 'review', note, actions })}
  </div>`;
}

export function reviewDone({ session, progress, byId }) {
  const retired = session.cleared.filter((id) => progress.mastered[id]);
  const scheduled = session.cleared.filter((id) => progress.srs[id])
    .map((id) => ({ q: byId.get(id), due: progress.srs[id].due }))
    .sort((a, b) => a.due - b.due);
  const attempts = Object.values(session.tries).reduce((a, b) => a + b, 0);
  return `<div class="card p-6 text-center sm:p-10">
    <p class="text-sm font-semibold uppercase tracking-wide text-good-ink">Loop complete</p>
    <p class="mt-2 text-5xl font-semibold">100%</p>
    <p class="mt-3 text-ink-2">Every question in this loop is now answered correctly: ${session.total} ${session.total === 1 ? 'question' : 'questions'}, ${plural(attempts, 'attempt')}, ${session.firstTry} right first time.</p>
    ${scheduled.length ? `<ul class="mx-auto mt-6 max-w-md space-y-1 text-left text-sm">${scheduled.map((s) => `<li class="flex justify-between gap-4"><span>${esc(s.q.micro_topic)}</span><span class="whitespace-nowrap text-ink-2">next ${esc(fmtDay(s.due))}</span></li>`).join('')}</ul>` : ''}
    ${retired.length ? `<p class="mt-4 text-sm text-ink-2">${plural(retired.length, 'question')} retired after its final spaced check.</p>` : ''}
    <div class="mt-8 flex flex-wrap justify-center gap-3">
      <button type="button" class="btn btn-primary" data-action="end-review">Back to mistake book</button>
      <button type="button" class="btn btn-ghost" data-action="goto" data-view="practice">Practice</button>
    </div>
  </div>`;
}
