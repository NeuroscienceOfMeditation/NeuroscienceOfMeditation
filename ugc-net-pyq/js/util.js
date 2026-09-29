/* Small helpers shared by every module. No DOM access here, so the pure
   modules that import this file also run under Node for the tests. */

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function inline(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/**
 * The only markup the data files may use: blank lines between paragraphs,
 * "- " at the start of a line for a bullet, **bold**. Text is escaped first,
 * so a data file can never inject HTML.
 */
export function richText(src) {
  return String(src ?? '').trim().split(/\n\s*\n/).map((block) => {
    let html = '';
    let para = [];
    let list = [];
    const flushPara = () => {
      if (para.length) html += '<p>' + para.map(inline).join('<br>') + '</p>';
      para = [];
    };
    const flushList = () => {
      if (list.length) html += '<ul>' + list.map((li) => '<li>' + inline(li) + '</li>').join('') + '</ul>';
      list = [];
    };
    for (const line of block.split('\n')) {
      const bullet = line.match(/^\s*[-•]\s+(.*)$/);
      if (bullet) { flushPara(); list.push(bullet[1]); } else { flushList(); para.push(line); }
    }
    flushPara();
    flushList();
    return html;
  }).join('');
}

/** A, B, C … for list items; I, II, III … for List II of a match question. */
export const LETTERS = 'ABCDEFGHIJ'.split('');
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/**
 * Folds IAST diacritics and common spelling variants so that "kleshas",
 * "klesa" and "kleśa" all find each other in search.
 */
export function fold(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/sh/g, 's').replace(/ri/g, 'r').replace(/w/g, 'v')
    .replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u');
}

export function pct(part, whole) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

export function plural(n, one, many) {
  return n + ' ' + (n === 1 ? one : (many || one + 's'));
}

export function fmtDay(t) {
  return new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
