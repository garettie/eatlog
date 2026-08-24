(() => {
  const root = document.documentElement;
  let frame = 0;

  const updateProgress = () => {
    frame = 0;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
    root.style.setProperty('--scroll-progress', progress.toFixed(4));
  };

  const requestUpdate = () => {
    if (!frame) frame = window.requestAnimationFrame(updateProgress);
  };

  const tabs = [...document.querySelectorAll('.tier-tab')];
  const panels = [...document.querySelectorAll('[data-tier-panel]')];

  const selectTier = (nextTab, focus = false) => {
    tabs.forEach((tab) => {
      const selected = tab === nextTab;
      tab.classList.toggle('is-selected', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.tierPanel !== nextTab.dataset.tier;
    });
    if (focus) nextTab.focus();
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTier(tab));
    tab.addEventListener('keydown', (event) => {
      let nextIndex = index;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = tabs.length - 1;
      else return;
      event.preventDefault();
      selectTier(tabs[nextIndex], true);
    });
  });

  document.querySelector('.skip-link')?.addEventListener('click', () => {
    window.requestAnimationFrame(() => document.querySelector('#main')?.focus());
  });

  const mobileMenu = document.querySelector('.mobile-nav');
  mobileMenu?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      mobileMenu.open = false;
    });
  });
  updateProgress();
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate, { passive: true });
})();
