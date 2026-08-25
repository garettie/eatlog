(() => {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(pointer: fine)');
  const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
  let scrollFrame = 0;

  const updateProgress = () => {
    scrollFrame = 0;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? clamp(window.scrollY / scrollable) : 0;
    root.style.setProperty('--scroll-progress', progress.toFixed(4));
    updateStory();
  };

  const requestProgressUpdate = () => {
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateProgress);
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

  const stage = document.querySelector('[data-mog-stage]');
  if (stage && finePointer.matches && !reducedMotion.matches) {
    let pointerFrame = 0;
    let latestPointer = null;

    const resetStage = () => {
      stage.style.setProperty('--stage-x', '0deg');
      stage.style.setProperty('--stage-y', '0deg');
    };

    stage.addEventListener('pointermove', (event) => {
      latestPointer = event;
      if (pointerFrame) return;
      pointerFrame = window.requestAnimationFrame(() => {
        pointerFrame = 0;
        const rect = stage.getBoundingClientRect();
        const x = clamp((latestPointer.clientX - rect.left) / rect.width) * 2 - 1;
        const y = clamp((latestPointer.clientY - rect.top) / rect.height) * 2 - 1;
        stage.style.setProperty('--stage-x', `${(-y * 2.4).toFixed(2)}deg`);
        stage.style.setProperty('--stage-y', `${(x * 3.8).toFixed(2)}deg`);
      });
    }, { passive: true });
    stage.addEventListener('pointerleave', resetStage);
  }

  const storySteps = [...document.querySelectorAll('[data-story-step]')];
  const storyImages = [...document.querySelectorAll('[data-story-image]')];
  const storyCounter = document.querySelector('[data-story-counter]');

  const selectStoryStep = (step) => {
    const key = step.dataset.storyStep;
    storySteps.forEach((candidate) => candidate.classList.toggle('is-active', candidate === step));
    storyImages.forEach((image) => image.classList.toggle('is-active', image.dataset.storyImage === key));
    if (storyCounter) storyCounter.textContent = step.dataset.storyNumber;
  };

  const updateStory = () => {
    if (!storySteps.length) return;
    const focusLine = window.innerHeight * 0.56;
    const active = storySteps.reduce((closest, step) => {
      const rect = step.getBoundingClientRect();
      const distance = Math.abs(rect.top + rect.height / 2 - focusLine);
      return !closest || distance < closest.distance ? { step, distance } : closest;
    }, null)?.step;
    if (active) selectStoryStep(active);
  };

  updateProgress();
  window.addEventListener('scroll', requestProgressUpdate, { passive: true });
  window.addEventListener('resize', requestProgressUpdate, { passive: true });
})();
