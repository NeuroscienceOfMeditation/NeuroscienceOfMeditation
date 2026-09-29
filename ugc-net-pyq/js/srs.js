/* Spaced repetition for wrong answers (a Leitner scheme).

   - Any wrong answer, in Practice or Review, puts the question in the
     mistake book at box 0, due now.
   - In Review, a correct answer moves it up one box: the next check is
     1, 3, then 7 days later. Clearing box 3 retires ("masters") it.
   - A wrong answer in Review drops it back to box 0 and puts it back into
     the current loop a few questions later, so a review loop only ends
     when every question in it has been answered correctly.

   Every function returns new objects; nothing is mutated. */

export const INTERVAL_DAYS = [0, 1, 3, 7];
export const REQUEUE_GAP = 3;

export function emptyProgress() {
  return { version: 1, attempts: {}, srs: {}, mastered: {} };
}

function addDays(t, days) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Records an attempt. A wrong answer (re)enters the mistake book at box 0. */
export function recordAnswer(progress, id, correct, now) {
  const prev = progress.attempts[id] || { n: 0, correct: 0 };
  const attempts = {
    ...progress.attempts,
    [id]: { n: prev.n + 1, correct: prev.correct + (correct ? 1 : 0), last: correct, at: now },
  };
  if (correct) return { ...progress, attempts };

  const card = progress.srs[id];
  const srs = { ...progress.srs, [id]: { box: 0, due: now, lapses: (card ? card.lapses : 0) + 1, since: card ? card.since : now } };
  const mastered = { ...progress.mastered };
  delete mastered[id];
  return { ...progress, attempts, srs, mastered };
}

/** A correct answer in Review: next box, or retire after the last one. */
export function promote(progress, id, now) {
  const card = progress.srs[id];
  if (!card) return progress;
  const box = card.box + 1;
  const srs = { ...progress.srs };
  if (box >= INTERVAL_DAYS.length) {
    delete srs[id];
    return { ...progress, srs, mastered: { ...progress.mastered, [id]: now } };
  }
  srs[id] = { ...card, box, due: addDays(now, INTERVAL_DAYS[box]) };
  return { ...progress, srs };
}

/** Mistake-book ids among `ids`, most overdue first, then most-missed first. */
export function reviewIds(progress, ids, now, includeNotDue = false) {
  return ids
    .filter((id) => progress.srs[id] && (includeNotDue || progress.srs[id].due <= now))
    .sort((a, b) => progress.srs[a].due - progress.srs[b].due || progress.srs[b].lapses - progress.srs[a].lapses);
}

export function startSession(ids) {
  return { queue: ids.slice(), total: ids.length, tries: {}, cleared: [], firstTry: 0 };
}

/**
 * Applies an answer to the question at the head of the loop. Correct: it
 * leaves the loop. Wrong: it goes back REQUEUE_GAP places later (or to the
 * end of a shorter queue), so it comes round again after a short gap.
 */
export function answerInSession(session, correct) {
  const [id, ...rest] = session.queue;
  const tries = { ...session.tries, [id]: (session.tries[id] || 0) + 1 };
  if (correct) {
    return {
      ...session,
      queue: rest,
      tries,
      cleared: [...session.cleared, id],
      firstTry: session.firstTry + (tries[id] === 1 ? 1 : 0),
    };
  }
  const at = Math.min(REQUEUE_GAP, rest.length);
  return { ...session, queue: [...rest.slice(0, at), id, ...rest.slice(at)], tries };
}

export function sessionDone(session) {
  return session.queue.length === 0;
}
