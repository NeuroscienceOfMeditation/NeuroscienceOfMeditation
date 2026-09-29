/* Sidebar filters: which questions match, and the choices each control
   offers given the others. Pure functions over the validated bank. */

import { fold } from './util.js';
import { unitLabel, unitKey } from './data.js';

export const DEFAULT_FILTERS = {
  subject: 'all',   // 'all' | subject id
  session: 'all',   // 'all' | '2025' | '2025-June' | 'undated'
  unit: 'all',      // 'all' | 'yoga-4'
  topic: 'all',     // 'all' | micro_topic text
  type: 'all',      // 'all' | question_type
  status: 'all',    // 'all' | 'unattempted' | 'wrong' | 'mistakes'
  q: '',            // free-text search
};

export const STATUS_OPTIONS = {
  all: 'All questions',
  unattempted: 'Not attempted yet',
  wrong: 'Last answer was wrong',
  mistakes: 'In my mistake book',
};

function searchText(q) {
  if (!q._search) {
    const parts = [q.id, q.question_text, q.micro_topic, q.macro_unit, q.assertion, q.reason,
      ...(q.items || []), ...(q.options || []),
      ...(q.lists ? [...q.lists.list_i.items, ...q.lists.list_ii.items] : [])];
    Object.defineProperty(q, '_search', { value: fold(parts.filter(Boolean).join(' ')) });
  }
  return q._search;
}

export function matches(q, f, progress) {
  if (f.subject !== 'all' && q.subject !== f.subject) return false;
  if (f.session !== 'all') {
    if (/^\d{4}$/.test(f.session)) {
      if (String(q.exam_year) !== f.session) return false;
    } else if (q._session.key !== f.session) {
      return false;
    }
  }
  if (f.unit !== 'all' && q._unitKey !== f.unit) return false;
  if (f.topic !== 'all' && q.micro_topic !== f.topic) return false;
  if (f.type !== 'all' && q.question_type !== f.type) return false;
  if (f.status !== 'all') {
    const a = progress.attempts[q.id];
    if (f.status === 'unattempted' && a) return false;
    if (f.status === 'wrong' && !(a && a.last === false)) return false;
    if (f.status === 'mistakes' && !progress.srs[q.id]) return false;
  }
  if (f.q && f.q.trim()) {
    const hay = searchText(q);
    if (!fold(f.q).split(/\s+/).filter(Boolean).every((t) => hay.includes(t))) return false;
  }
  return true;
}

export function applyFilters(questions, f, progress) {
  return questions.filter((q) => matches(q, f, progress));
}

/** Years (newest first), each with its June/December sessions, plus undated. */
export function sessionOptions(questions) {
  const years = new Map();
  let undated = 0;
  for (const q of questions) {
    const s = q._session;
    if (s.year == null) { undated++; continue; }
    if (!years.has(s.year)) years.set(s.year, { year: s.year, count: 0, sessions: new Map() });
    const y = years.get(s.year);
    y.count++;
    const entry = y.sessions.get(s.key) || { key: s.key, label: s.label, order: s.order, count: 0 };
    entry.count++;
    y.sessions.set(s.key, entry);
  }
  return {
    years: [...years.values()]
      .sort((a, b) => b.year - a.year)
      .map((y) => ({ ...y, sessions: [...y.sessions.values()].sort((a, b) => b.order - a.order) })),
    undated,
  };
}

/** Every syllabus unit for the chosen subject(s), with its question count. */
export function unitOptions(syllabus, questions, subject) {
  const counts = new Map();
  for (const q of questions) counts.set(q._unitKey, (counts.get(q._unitKey) || 0) + 1);
  return syllabus.subjects
    .filter((s) => subject === 'all' || s.id === subject)
    .map((s) => ({
      subject: s,
      units: s.units.map((u) => {
        const key = unitKey(s.id, u.no);
        return { key, no: u.no, title: u.title, label: unitLabel(s, u), count: counts.get(key) || 0 };
      }),
    }));
}

/** Micro-topics within the chosen subject and unit, most frequent first. */
export function topicOptions(questions, f) {
  const counts = new Map();
  for (const q of questions) {
    if (f.subject !== 'all' && q.subject !== f.subject) continue;
    if (f.unit !== 'all' && q._unitKey !== f.unit) continue;
    counts.set(q.micro_topic, (counts.get(q.micro_topic) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

/** Drops unit and topic choices that no longer fit the chosen subject. */
export function reconcile(f, questions) {
  const next = { ...f };
  if (next.subject !== 'all' && next.unit !== 'all' && !next.unit.startsWith(next.subject + '-')) next.unit = 'all';
  if (next.topic !== 'all' && !topicOptions(questions, next).some((t) => t.topic === next.topic)) next.topic = 'all';
  return next;
}

export function isFiltered(f) {
  return Object.keys(DEFAULT_FILTERS).some((k) => f[k] !== DEFAULT_FILTERS[k]);
}
