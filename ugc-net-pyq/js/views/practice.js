/* Practice: step through the filtered questions one at a time. */

import { esc } from '../util.js';
import { questionCard } from './question.js';

export function emptyState(message, withReset) {
  return `<div class="card p-8 text-center">
    <p class="text-lg font-semibold">${message}</p>
    ${withReset ? '<button type="button" class="btn btn-primary mt-5" data-action="reset-filters">Reset filters</button>' : ''}
  </div>`;
}

export function practiceView({ deck, index, q, subject, st, freq, shuffled, inBook }) {
  if (!deck.length) return emptyState('No questions match these filters.', true);

  const n = deck.length;
  const pos = index + 1;
  const last = pos === n;
  const note = st.submitted && st.choice !== q.correct_answer
    ? 'Added to your mistake book. It will come up in <strong>Review mistakes</strong>.'
    : (st.submitted && inBook ? 'This question is still in your mistake book; clear it from <strong>Review mistakes</strong>.' : '');
  const actions = `
    ${last ? '' : '<button type="button" class="btn btn-primary" data-action="next">Next question →</button>'}
    ${last ? '<p class="text-sm text-ink-2">That was the last question in this set.</p>' : ''}
    <button type="button" class="btn btn-ghost" data-action="retry">Try again</button>`;

  return `<div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <p class="text-sm font-medium" aria-live="polite">Question ${pos} of ${n}</p>
      <div class="progress flex-1" role="progressbar" aria-label="Position in this set" aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="${pos}">
        <span style="width:${(pos / n) * 100}%"></span>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" class="btn btn-ghost btn-sm" data-action="shuffle" aria-pressed="${shuffled}">${shuffled ? 'Syllabus order' : 'Shuffle'}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="prev"${index === 0 ? ' disabled' : ''} aria-label="Previous question">←</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="next"${last ? ' disabled' : ''} aria-label="Next question">→</button>
      </div>
    </div>
    ${questionCard({ q, subject, st, freq, name: 'practice', note, actions })}
    <p class="text-center text-xs text-muted">Link to this question: <a class="link" href="#view=practice&amp;q=${encodeURIComponent(q.id)}">${esc(q.id)}</a></p>
  </div>`;
}
