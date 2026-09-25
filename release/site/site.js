(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(pointer: fine)');
  const usesStickyStory = () => window.innerWidth > 960 && (window.innerWidth > 1100 || window.innerHeight > 700);
  const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
  let scrollFrame = 0;

  const stage = document.querySelector('[data-mog-stage]');
  const hero = document.querySelector('.mog-hero');

  const updateDial = () => {
    if (!stage || !hero) return;
    const rect = hero.getBoundingClientRect();
    const progress = clamp(-rect.top / (rect.height * 0.85));
    stage.style.setProperty('--dial-progress', (0.06 + progress * 0.94).toFixed(4));
  };

  const updateProgress = () => {
    scrollFrame = 0;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? clamp(window.scrollY / scrollable) : 0;
    root.style.setProperty('--scroll-progress', progress.toFixed(4));
    updateDial();
    updateStory();
  };

  const requestProgressUpdate = () => {
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateProgress);
  };

  document.querySelector('.skip-link')?.addEventListener('click', () => {
    window.requestAnimationFrame(() => document.querySelector('#main')?.focus());
  });

  const mobileMenu = document.querySelector('.mobile-nav');
  mobileMenu?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      mobileMenu.open = false;
    });
  });

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
  const storyRail = document.querySelector('[data-story-rail]');

  const selectStoryStep = (step) => {
    const key = step.dataset.storyStep;
    storySteps.forEach((candidate) => candidate.classList.toggle('is-active', candidate === step));
    storyImages.forEach((image) => image.classList.toggle('is-active', image.dataset.storyImage === key));
    if (storyRail) {
      storyRail.parentElement.style.setProperty('--story-fill', ((storySteps.indexOf(step) + 1) / storySteps.length).toFixed(4));
    }
  };

  const updateStory = () => {
    if (!usesStickyStory() || !storySteps.length) return;
    const focusLine = window.innerHeight * 0.56;
    const active = storySteps.reduce((closest, step) => {
      const rect = step.getBoundingClientRect();
      const distance = Math.abs(rect.top + rect.height / 2 - focusLine);
      return !closest || distance < closest.distance ? { step, distance } : closest;
    }, null)?.step;
    if (active) selectStoryStep(active);
  };

  const tickerTrack = document.querySelector('.mog-ticker__track');
  const tickerGroup = tickerTrack?.querySelector('.mog-ticker__group');
  if (tickerTrack && tickerGroup) {
    const fillTicker = () => {
      tickerTrack.querySelectorAll('.mog-ticker__group:not(:first-child)').forEach((clone) => clone.remove());
      const groupWidth = tickerGroup.offsetWidth;
      while (tickerTrack.offsetWidth < window.innerWidth * 2 + groupWidth) {
        const clone = tickerGroup.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        tickerTrack.appendChild(clone);
      }
      tickerTrack.style.setProperty('--ticker-shift', `${-groupWidth}px`);
    };
    fillTicker();
    if (document.fonts?.ready) document.fonts.ready.then(fillTicker);
    window.addEventListener('resize', fillTicker);
  }

  updateProgress();
  window.addEventListener('scroll', requestProgressUpdate, { passive: true });
  window.addEventListener('resize', requestProgressUpdate, { passive: true });

  const revealTargets = [...document.querySelectorAll('[data-reveal]')];
  let revealSweepFrame = 0;

  const sweepReveals = () => {
    revealSweepFrame = 0;
    if (!revealTargets.length) return;
    const foldLine = window.innerHeight * 0.96;
    for (let index = revealTargets.length - 1; index >= 0; index -= 1) {
      if (revealTargets[index].getBoundingClientRect().top <= foldLine) {
        revealTargets[index].classList.add('is-revealed');
        revealTargets.splice(index, 1);
      }
    }
  };

  const requestRevealSweep = () => {
    if (!revealSweepFrame) revealSweepFrame = window.requestAnimationFrame(sweepReveals);
  };

  if (reducedMotion.matches || !revealTargets.length) {
    revealTargets.forEach((target) => target.classList.add('is-revealed'));
  } else {
    requestRevealSweep();
    window.addEventListener('scroll', requestRevealSweep, { passive: true });
    window.addEventListener('resize', requestRevealSweep, { passive: true });
  }

  const cookButton = document.querySelector('[data-cook-button]');
  const cookFire = document.querySelector('[data-cook-fire]');
  let fireEffect = document.querySelector('[data-cook-fire-effect]');
  const cookStatus = document.querySelector('#cook-status');

  if (cookButton && cookFire && fireEffect) {
    let pressCount = 0;
    let effectTimer = 0;
    let startFrame = 0;
    let showFrame = 0;
    let navigateTimer = 0;

    cookButton.addEventListener('click', (event) => {
      // Modified clicks (new tab, new window) and reduced motion go straight to the link.
      if (reducedMotion.matches || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      pressCount += 1;

      const currentPress = pressCount;
      const nextEffect = document.createElement('img');
      nextEffect.className = 'mog-cook__fire-effect';
      nextEffect.dataset.cookFireEffect = '';
      nextEffect.alt = '';

      window.cancelAnimationFrame(startFrame);
      window.cancelAnimationFrame(showFrame);
      window.clearTimeout(effectTimer);
      cookFire.classList.remove('is-active');
      fireEffect.replaceWith(nextEffect);
      fireEffect = nextEffect;

      startFrame = window.requestAnimationFrame(() => {
        if (fireEffect !== nextEffect) return;
        nextEffect.src = `/assets/fire-click.svg?press=${currentPress}`;
        showFrame = window.requestAnimationFrame(() => {
          if (fireEffect !== nextEffect) return;
          cookFire.classList.add('is-active');
          effectTimer = window.setTimeout(() => cookFire.classList.remove('is-active'), 3000);
        });
      });

      if (cookStatus) cookStatus.textContent = 'Cooking!';
      window.clearTimeout(navigateTimer);
      navigateTimer = window.setTimeout(() => window.location.assign(cookButton.href), 1400);
    });

    window.addEventListener('pagehide', () => {
      window.cancelAnimationFrame(startFrame);
      window.cancelAnimationFrame(showFrame);
      window.clearTimeout(effectTimer);
      window.clearTimeout(navigateTimer);
    }, { once: true });
  }
})();
