/* Loads data/syllabus.json and every question file it names, checks each
   question against the schema, and adds a few derived fields (prefixed
   with "_") that the rest of the app reads. Questions that fail the check
   are left out and reported, never half-rendered. */

export const QUESTION_TYPES = {
  mcq: 'Single correct answer',
  match: 'Match List I with List II',
  assertion_reason: 'Assertion–Reason',
  statements: 'Multiple statements',
  sequence: 'Sequence / chronology',
};

export const SOURCE_TYPES = {
  official: 'Official NTA paper',
  memory_based: 'Memory-based PYQ',
  model: 'PYQ-pattern model',
};

export const CYCLES = ['June', 'December'];

const REQUIRED_TEXT = [
  'id', 'subject', 'question_text', 'detailed_explanation',
  'macro_unit', 'micro_topic', 'trend_analysis',
];

export function unitLabel(subject, unit) {
  return `${subject.short} Unit ${unit.no}: ${unit.title}`;
}

export function unitKey(subjectId, no) {
  return `${subjectId}-${no}`;
}

/** Exam session of a question; undated (model) questions share one bucket. */
export function sessionOf(q) {
  if (q.exam_year == null) {
    return { key: 'undated', label: 'Undated', year: null, order: Infinity };
  }
  return {
    key: `${q.exam_year}-${q.exam_cycle}`,
    label: `${q.exam_cycle} ${q.exam_year}`,
    year: q.exam_year,
    order: q.exam_year * 2 + CYCLES.indexOf(q.exam_cycle),
  };
}

function isText(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function isTextList(v, min) {
  return Array.isArray(v) && v.length >= min && v.every(isText);
}

export function checkQuestion(q, subjects, units) {
  if (!q || typeof q !== 'object' || Array.isArray(q)) return ['not a JSON object'];
  const errors = [];

  for (const field of REQUIRED_TEXT) {
    if (!isText(q[field])) errors.push(`"${field}" is missing or empty`);
  }
  if (isText(q.subject) && !subjects.has(q.subject)) {
    errors.push(`subject "${q.subject}" is not in syllabus.json (use ${[...subjects.keys()].join(' or ')})`);
  }
  if (isText(q.macro_unit)) {
    const unit = units.get(q.macro_unit);
    if (!unit) {
      errors.push(`macro_unit "${q.macro_unit}" does not match a unit in syllabus.json`);
    } else if (unit.subject.id !== q.subject) {
      errors.push(`macro_unit "${q.macro_unit}" belongs to ${unit.subject.name}, not "${q.subject}"`);
    }
  }

  if (!isTextList(q.options, 2)) {
    errors.push('"options" must be a list of at least two answer texts');
  } else if (!Number.isInteger(q.correct_answer) || q.correct_answer < 1 || q.correct_answer > q.options.length) {
    errors.push(`"correct_answer" must be an option number from 1 to ${q.options.length}`);
  }

  const type = q.question_type ?? 'mcq';
  if (!Object.hasOwn(QUESTION_TYPES, type)) {
    errors.push(`question_type "${type}" is not one of ${Object.keys(QUESTION_TYPES).join(', ')}`);
  }
  if (type === 'match' && !(q.lists && isTextList(q.lists.list_i?.items, 2) && isTextList(q.lists.list_ii?.items, 2))) {
    errors.push('a match question needs lists.list_i.items and lists.list_ii.items');
  }
  if (type === 'assertion_reason' && !(isText(q.assertion) && isText(q.reason))) {
    errors.push('an assertion_reason question needs "assertion" and "reason"');
  }
  if ((type === 'statements' || type === 'sequence') && !isTextList(q.items, 2)) {
    errors.push(`a ${type} question needs an "items" list`);
  }

  const dated = q.exam_year != null || q.exam_cycle != null;
  if (dated) {
    if (!Number.isInteger(q.exam_year) || q.exam_year < 2000 || q.exam_year > 2100) {
      errors.push('"exam_year" must be a year such as 2025');
    }
    if (!CYCLES.includes(q.exam_cycle)) errors.push('"exam_cycle" must be "June" or "December"');
  }
  const sourceType = q.source?.type ?? (dated ? 'official' : 'model');
  if (!Object.hasOwn(SOURCE_TYPES, sourceType)) {
    errors.push(`source.type "${sourceType}" is not one of ${Object.keys(SOURCE_TYPES).join(', ')}`);
  } else if (sourceType === 'model' && dated) {
    errors.push('a model question cannot carry an exam_year or exam_cycle');
  } else if (sourceType !== 'model' && !dated) {
    errors.push(`a ${sourceType} question needs exam_year and exam_cycle`);
  }

  return errors;
}

/**
 * entries: [{ q, file }] in load order. Returns the valid questions with
 * derived fields, and a list of { id, file, errors } for the rest.
 */
export function validateBank(syllabus, entries) {
  const subjects = new Map(syllabus.subjects.map((s) => [s.id, s]));
  const units = new Map();
  for (const s of syllabus.subjects) {
    for (const u of s.units) units.set(unitLabel(s, u), { subject: s, unit: u });
  }

  const seen = new Set();
  const questions = [];
  const problems = [];
  for (const { q, file } of entries) {
    const id = q && isText(q.id) ? q.id : '(no id)';
    const errors = checkQuestion(q, subjects, units);
    if (!errors.length && seen.has(id)) errors.push(`duplicate id "${id}"`);
    if (errors.length) {
      problems.push({ id, file, errors });
      continue;
    }
    seen.add(id);
    const { subject, unit } = units.get(q.macro_unit);
    const dated = q.exam_year != null;
    questions.push({
      ...q,
      question_type: q.question_type ?? 'mcq',
      source: { ...q.source, type: q.source?.type ?? (dated ? 'official' : 'model') },
      _session: sessionOf(q),
      _unitKey: unitKey(subject.id, unit.no),
      _unitNo: unit.no,
      _subjectOrder: syllabus.subjects.indexOf(subject),
    });
  }

  // Syllabus order, newest paper first within a unit (undated last), then by id.
  const recency = (q) => (q._session.year == null ? -1 : q._session.order);
  questions.sort((a, b) =>
    a._subjectOrder - b._subjectOrder ||
    a._unitNo - b._unitNo ||
    recency(b) - recency(a) ||
    a.id.localeCompare(b.id));

  return { syllabus, questions, problems };
}

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  try {
    return await res.json();
  } catch (e) {
    throw new Error(`${url} is not valid JSON (${e.message})`);
  }
}

export async function loadBank(base = 'data/') {
  const syllabus = await getJSON(base + 'syllabus.json');
  const files = syllabus.subjects.flatMap((s) => s.question_files || []);
  const lists = await Promise.all(files.map((file) => getJSON(base + file).then((list) => {
    if (!Array.isArray(list)) throw new Error(`${file} must contain a JSON list [ … ] of questions`);
    return list.map((q) => ({ q, file }));
  })));
  return validateBank(syllabus, lists.flat());
}
