/* Compact calendar chrome. Notifications never participate in page layout. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const toast = $('toast');
  if (toast) {
    let timeout;
    new MutationObserver(() => {
      clearTimeout(timeout);
      toast.classList.toggle('notification-visible', !!toast.textContent.trim());
      if (toast.textContent.trim()) timeout = setTimeout(() => toast.classList.remove('notification-visible'), 4500);
    }).observe(toast, { childList: true, subtree: true, characterData: true });
  }
  const disclosures = [['calendar-date-toggle', 'calendar-date-popover'], ['calendar-more-toggle', 'timeline-actions']];
  function closeDisclosures(restore) {
    disclosures.forEach(([trigger, panel]) => {
      const wasOpen = !$(panel).hidden;
      $(panel).hidden = true; $(trigger).setAttribute('aria-expanded', 'false');
      if (restore && wasOpen) $(trigger).focus();
    });
  }
  disclosures.forEach(([trigger, panel]) => {
    $(trigger).onclick = () => {
      const opening = $(panel).hidden; closeDisclosures(false);
      $(panel).hidden = !opening; $(trigger).setAttribute('aria-expanded', String(opening));
      if (opening) $(panel).querySelector('input,button')?.focus();
    };
  });
  let returnToOptions = false;
  $('modal').addEventListener('close', () => { if (returnToOptions) { returnToOptions = false; $('calendar-more-toggle').focus(); } });
  document.addEventListener('click', e => {
    if (!e.target.closest('.calendar-date-picker,.calendar-more')) closeDisclosures(false);
    if (e.target.closest('#timeline-actions button')) { returnToOptions = $('modal').open; closeDisclosures(false); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) closeDisclosures(true); });
  $('calendar-date').addEventListener('change', () => { closeDisclosures(false); $('calendar-date-toggle').focus(); });

  const aside = document.querySelector('.shell>aside'), nav = aside?.querySelector('nav');
  if (!nav) return;
  const bar = document.createElement('div'); bar.className = 'mobile-app-bar';
  bar.innerHTML = '<button id="mobile-menu-toggle" aria-label="Open navigation" aria-haspopup="dialog">☰</button><span>Daily Project Planner</span>';
  aside.before(bar);
  const dialog = document.createElement('dialog'); dialog.id = 'mobile-navigation'; dialog.setAttribute('aria-label', 'Main navigation');
  dialog.innerHTML = '<button id="mobile-menu-close" aria-label="Close navigation">×</button>';
  document.body.append(dialog);
  function closeMenu() { if (dialog.open) dialog.close(); }
  $('mobile-menu-toggle').onclick = () => { dialog.showModal(); $('mobile-menu-close').focus(); };
  $('mobile-menu-close').onclick = closeMenu;
  dialog.addEventListener('close', () => $('mobile-menu-toggle').focus());
  dialog.addEventListener('click', e => { if (e.target.closest('button[data-view]')) closeMenu(); if (e.target === dialog && e.clientX > dialog.getBoundingClientRect().right) closeMenu(); });
  const mobile = matchMedia('(max-width: 900px)');
  const relocate = () => { closeMenu(); (mobile.matches ? dialog : aside).append(nav); };
  mobile.addEventListener('change', relocate); relocate();
})();
