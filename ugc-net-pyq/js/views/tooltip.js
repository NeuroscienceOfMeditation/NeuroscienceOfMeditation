/* One shared tooltip for chart marks. Any element with data-tip gets it on
   hover and on keyboard focus. Every value it shows is also printed on the
   page, so the tooltip adds detail but never hides information. */

export function installTooltip(root) {
  const tip = document.createElement('div');
  tip.className = 'viz-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);

  function place(el) {
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
    const above = r.top - t.height - 8;
    tip.style.left = left + 'px';
    tip.style.top = (above > 8 ? above : r.bottom + 8) + 'px';
  }

  function show(el) {
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    place(el);
  }

  function hide() {
    tip.hidden = true;
  }

  root.addEventListener('pointerover', (e) => {
    const el = e.target.closest('[data-tip]');
    if (el) show(el);
  });
  root.addEventListener('pointerout', (e) => {
    const el = e.target.closest('[data-tip]');
    if (el && !el.contains(e.relatedTarget)) hide();
  });
  root.addEventListener('focusin', (e) => {
    const el = e.target.closest('[data-tip]');
    if (el) show(el); else hide();
  });
  root.addEventListener('focusout', hide);
  window.addEventListener('scroll', hide, { passive: true });
}
