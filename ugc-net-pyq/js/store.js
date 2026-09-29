/* Progress and preferences live in this browser's localStorage. Private
   windows and blocked storage can make every call throw; the app then
   keeps progress in memory for the tab and says so. */

import { emptyProgress } from './srs.js';

const PROGRESS_KEY = 'ugcnet-pyq.progress.v1';
const PREFS_KEY = 'ugcnet-pyq.prefs.v1';
export const THEME_KEY = 'ugcnet-pyq.theme';

export function storageWorks() {
  try {
    const k = PROGRESS_KEY + '.probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch (e) {
    return false;
  }
}

function isRecord(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

/** Accepts anything, returns a well-formed progress object (bad entries dropped). */
export function sanitizeProgress(raw) {
  const p = emptyProgress();
  if (!isRecord(raw)) return p;
  for (const [id, a] of Object.entries(isRecord(raw.attempts) ? raw.attempts : {})) {
    if (isRecord(a) && Number.isFinite(a.n) && Number.isFinite(a.correct)) {
      p.attempts[id] = { n: a.n, correct: a.correct, last: a.last === true, at: Number(a.at) || 0 };
    }
  }
  for (const [id, c] of Object.entries(isRecord(raw.srs) ? raw.srs : {})) {
    if (isRecord(c) && Number.isInteger(c.box) && Number.isFinite(c.due)) {
      p.srs[id] = { box: Math.max(0, Math.min(3, c.box)), due: c.due, lapses: Number(c.lapses) || 1, since: Number(c.since) || c.due };
    }
  }
  for (const [id, t] of Object.entries(isRecord(raw.mastered) ? raw.mastered : {})) {
    if (Number.isFinite(t)) p.mastered[id] = t;
  }
  return p;
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return sanitizeProgress(JSON.parse(raw));
  } catch (e) { /* fall through to a fresh start */ }
  return emptyProgress();
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch (e) { /* in-memory only for this tab */ }
}

export function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    return isRecord(raw) ? raw : {};
  } catch (e) {
    return {};
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (e) { /* not essential */ }
}

export function loadTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch (e) {
    return 'system';
  }
}

export function saveTheme(theme) {
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch (e) { /* not essential */ }
}
