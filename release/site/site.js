(() => {
  const root = document.documentElement;
  const instrumentStage = document.querySelector('.instrument-stage');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(pointer: fine)');
  const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
  let frame = 0;

  const hero = document.querySelector('.hero');
  const workflowPairs = [...document.querySelectorAll('.workflow-pair')];

  if (!reducedMotion.matches) {
    root.classList.add('motion-ready');
    window.requestAnimationFrame(() => hero?.classList.add('is-energized'));

    if ('IntersectionObserver' in window) {
      const stageObserver = new IntersectionObserver(([entry]) => {
        instrumentStage?.classList.toggle('is-visible', entry.isIntersecting);
      }, { threshold: 0.18 });
      if (instrumentStage) stageObserver.observe(instrumentStage);


      const pairObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in-view');
          observer.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.2 });
      workflowPairs.forEach((pair) => pairObserver.observe(pair));
    } else {
      instrumentStage?.classList.add('is-visible');
      workflowPairs.forEach((pair) => pair.classList.add('is-in-view'));
    }
  }

  const updateProgress = () => {
    frame = 0;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? clamp(window.scrollY / scrollable) : 0;
    root.style.setProperty('--scroll-progress', progress.toFixed(4));

  };

  const requestUpdate = () => {
    if (!frame) frame = window.requestAnimationFrame(updateProgress);
  };

  const tabs = [...document.querySelectorAll('.tier-tab')];
  const panels = [...document.querySelectorAll('[data-tier-panel]')];

  const selectTier = (nextTab, focus = false) => {
    if (nextTab.getAttribute('aria-selected') === 'true') {
      if (focus) nextTab.focus();
      return;
    }

    const applySelection = () => {
      tabs.forEach((tab) => {
        const selected = tab === nextTab;
        tab.classList.toggle('is-selected', selected);
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
      });
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.tierPanel !== nextTab.dataset.tier;
      });
    };

    if ('startViewTransition' in document && !reducedMotion.matches) {
      const transition = document.startViewTransition(applySelection);
      if (focus) transition.ready.then(() => nextTab.focus()).catch(() => nextTab.focus());
    } else {
      applySelection();
      if (focus) nextTab.focus();
    }
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

  if (instrumentStage && finePointer.matches && !reducedMotion.matches) {
    let pointerFrame = 0;
    let pointerEvent = null;
    const resetInstrument = () => {
      instrumentStage.style.setProperty('--dial-turn', '0deg');
      instrumentStage.style.setProperty('--tilt-x', '0deg');
      instrumentStage.style.setProperty('--tilt-y', '0deg');
      instrumentStage.style.setProperty('--phone-lift', '0px');
    };
    instrumentStage.addEventListener('pointermove', (event) => {
      pointerEvent = event;
      if (pointerFrame) return;
      pointerFrame = window.requestAnimationFrame(() => {
        pointerFrame = 0;
        const rect = instrumentStage.getBoundingClientRect();
        const x = clamp((pointerEvent.clientX - rect.left) / rect.width, 0, 1) * 2 - 1;
        const y = clamp((pointerEvent.clientY - rect.top) / rect.height, 0, 1) * 2 - 1;
        instrumentStage.style.setProperty('--dial-turn', `${(x * 14).toFixed(2)}deg`);
        instrumentStage.style.setProperty('--tilt-x', `${(-y * 3.2).toFixed(2)}deg`);
        instrumentStage.style.setProperty('--tilt-y', `${(x * 5.5).toFixed(2)}deg`);
        instrumentStage.style.setProperty('--phone-lift', `${(-4 * (1 - Math.abs(y))).toFixed(2)}px`);
      });
    }, { passive: true });
    instrumentStage.addEventListener('pointerleave', resetInstrument);
  }
  updateProgress();
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate, { passive: true });
})();
