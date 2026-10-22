(() => {
  'use strict';

  const { createTabs, animateIn, wait, reducedMotion, routes, getResult } = window.FaultView;

  function initProductScenes() {
    const evidenceTabs = createTabs(document.querySelector('[data-tabs="evidence"]'));
    let currentResult = getResult('products', 'error');
    let chapterObserver;
    const chapters = [...document.querySelectorAll('[data-profile-chapter]')];
    let chapterFrame = 0;
    let resizeFrame = 0;
    let disposed = false;
    const faultApp = document.querySelector('[data-fault-app]');
    const faultContent = faultApp.querySelector('.store-content');
    const faultFailure = faultApp.querySelector('.store-failure');
    const faultRecovered = faultApp.querySelector('.store-recovered');
    let lastFaultKey;
    let faultAnimations = [];

    function settleFaultMotion() {
      faultAnimations.forEach((animation) => animation.cancel());
      faultAnimations = [];
    }

    function softenFaultUpdate(previousProfile, wasFailure, result) {
      const { profile, verdict } = result;
      const cues = [];
      if (wasFailure !== (verdict === 'fail')) {
        cues.push([
          verdict === 'fail' ? faultFailure : faultContent,
          { duration: 420, distance: 6, fromOpacity: 0.92 },
        ]);
      } else if (verdict === 'fail') {
        cues.push([
          faultApp.querySelector('[data-fault-message]'),
          { duration: 280, distance: 3, fromOpacity: 0.85 },
        ]);
      } else if (profile.id === 'latency' || previousProfile === 'latency') {
        cues.push([
          faultApp.querySelector('.store-recommendations'),
          { duration: 340, distance: 4, fromOpacity: 0.9 },
        ]);
      }
      if (profile.id === 'recovery') {
        cues.push([faultRecovered, { duration: 360, distance: 4, fromOpacity: 0.85 }]);
      }
      for (const selector of [
        '[data-scene-profile]',
        '[data-fault-network]',
        '[data-fault-verdict]',
        '[data-fault-caption]',
      ]) {
        cues.push([
          document.querySelector(selector),
          { duration: 280, distance: 3, fromOpacity: 0.82 },
        ]);
      }
      // Outgoing layers are already hidden. Animate only the new content, never the frame.
      faultAnimations = cues
        .map(([element, options]) => animateIn(element, options))
        .filter(Boolean);
    }

    function renderEvidence(result, { focus = false } = {}) {
      currentResult = result;
      const { route, profile, verdict, issue } = result;
      document.querySelector('[data-evidence-route]').textContent = route.path;
      document.querySelector('[data-evidence-profile]').textContent = profile.label;
      document.querySelector('[data-evidence-endpoint]').textContent = route.target;
      document.querySelector('[data-evidence-advice]').textContent = issue;
      const badge = document.querySelector('[data-evidence-verdict]');
      badge.textContent = verdict.toUpperCase();
      badge.className = `verdict ${verdict}`;
      const capture = document.querySelector('[data-capture]');
      capture.dataset.verdict = verdict;
      document.querySelector('[data-capture-path]').textContent = route.path;
      document.querySelector('[data-capture-profile]').textContent = profile.label;
      document.querySelector('[data-capture-state]').textContent =
        verdict === 'fail'
          ? 'Не удалось загрузить страницу'
          : verdict === 'warn'
            ? 'Страница доступна с ограничениями'
            : 'Пользовательский путь доступен';
      document.querySelector('[data-capture-detail]').textContent =
        verdict === 'fail'
          ? `Недоступен ${route.target}`
          : profile.id === 'recovery'
            ? 'Данные загружены после повторного запроса'
            : verdict === 'warn'
              ? 'Ожидание или повтор запроса требует внимания'
              : 'Контекст страницы сохранён';
      document.querySelector('[data-evidence-console]').textContent =
        verdict === 'fail'
          ? `ERROR Unhandled rejection\n${route.target} → ${profile.network}\nPage.render interrupted\n\nRoute: ${route.path}\nProfile: ${profile.label}`
          : verdict === 'warn'
            ? `WARN Slow dependency\n${route.target} → ${profile.network}\nMain content remains available\n\nRoute: ${route.path}\nReview loading and retry states`
            : `INFO ${route.path}: main flow available\n${route.target} → ${profile.network}\n${profile.id === 'recovery' ? 'Retry completed; UI recovered' : 'UI context preserved'}\nNo blocking console errors`;
      document.querySelector('[data-evidence-network]').textContent = route.endpoints
        .map(
          (endpoint) =>
            `GET ${endpoint}\n  ${endpoint === route.target ? `${profile.network} · ${profile.duration}` : '200 OK'}`,
        )
        .join('\n\n');
      document.querySelectorAll('[data-result]').forEach((cell) => {
        const selected = cell.dataset.result === `${route.id}:${profile.id}`;
        cell.setAttribute('aria-pressed', String(selected));
      });
      evidenceTabs.select(0, { animate: focus });
      if (focus) {
        const heading = document.querySelector('#evidence-title');
        heading.focus({ preventScroll: true });
        document.querySelector('#evidence').scrollIntoView({
          behavior: reducedMotion.matches ? 'instant' : 'smooth',
          block: 'start',
        });
      }
    }

    function renderMap(routeId, { animate = true } = {}) {
      const activeRoute = routes.find((route) => route.id === routeId) ?? routes[0];
      document
        .querySelectorAll('[data-map-route]')
        .forEach((button) =>
          button.setAttribute('aria-pressed', String(button.dataset.mapRoute === activeRoute.id)),
        );
      document.querySelector('[data-map-path]').textContent = activeRoute.path;
      document.querySelector('[data-map-count]').textContent = activeRoute.endpoints.length;
      const list = document.querySelector('[data-map-endpoints]');
      list.replaceChildren(
        ...activeRoute.endpoints.map((endpoint) => {
          const item = document.createElement('li');
          const code = document.createElement('code');
          code.textContent = `GET ${endpoint}`;
          const description = document.createElement('span');
          description.textContent =
            endpoint === activeRoute.target ? 'выбран для отказа' : 'зависимость страницы';
          item.classList.toggle('target-endpoint', endpoint === activeRoute.target);
          item.append(code, description);
          return item;
        }),
      );
      if (animate) {
        [...list.children].forEach((element, index) =>
          animateIn(element, {
            duration: 400,
            distance: 12,
            delay: index * 110,
          }),
        );
      }
    }

    function renderFault(profileId) {
      const result = getResult('products', profileId);
      const { profile, verdict } = result;
      const key = `${profile.id}:${result.route.target}`;
      if (key === lastFaultKey) {
        return;
      }
      const previousProfile = faultApp.dataset.profile;
      const wasFailure = faultApp.dataset.verdict === 'fail';
      const animate = lastFaultKey !== undefined && previousProfile !== profile.id;
      settleFaultMotion();
      lastFaultKey = key;
      document.querySelector('[data-fault-endpoint]').textContent = `GET ${result.route.target}`;
      document.querySelector('[data-scene-profile]').textContent = profile.label;
      // Keep the browser frame mounted and opaque; only its inner layers transition.
      faultApp.dataset.verdict = verdict;
      faultApp.dataset.profile = profile.id;
      faultContent.setAttribute('aria-hidden', String(verdict === 'fail'));
      faultFailure.hidden = verdict !== 'fail';
      faultFailure.setAttribute('aria-hidden', String(verdict !== 'fail'));
      faultRecovered.hidden = profile.id !== 'recovery';
      faultRecovered.setAttribute('aria-hidden', String(profile.id !== 'recovery'));
      document.querySelector('[data-fault-network]').textContent = profile.network;
      document.querySelector('[data-fault-message]').textContent =
        profile.id === 'timeout' ? 'Время ожидания истекло' : 'Не удалось загрузить страницу';
      const badge = document.querySelector('[data-fault-verdict]');
      badge.textContent = verdict.toUpperCase();
      badge.className = `verdict ${verdict}`;
      document.querySelector('[data-fault-caption]').textContent = result.issue;
      chapters.forEach((chapter) =>
        chapter.classList.toggle('is-active', chapter.dataset.profileChapter === profile.id),
      );
      if (animate) {
        softenFaultUpdate(previousProfile, wasFailure, result);
      }
    }

    document.querySelectorAll('[data-map-route]').forEach((button) =>
      button.addEventListener('click', () => {
        renderMap(button.dataset.mapRoute);
      }),
    );
    document.querySelectorAll('[data-result]').forEach((button) =>
      button.addEventListener('click', () => {
        const [route, profile] = button.dataset.result.split(':');
        renderEvidence(getResult(route, profile), { focus: true });
      }),
    );
    document
      .querySelector('[data-critical-result]')
      .addEventListener('click', () => renderEvidence(getResult('products', 'error')));
    document
      .querySelector('[data-open-result]')
      .addEventListener('click', () => renderEvidence(currentResult, { focus: true }));
    document.querySelectorAll('input[name="session"]').forEach((input) =>
      input.addEventListener('change', () => {
        const saved = input.value === 'saved';
        document.querySelector('[data-session-description]').textContent = saved
          ? 'Сохранённая браузерная сессия открывает доступ к закрытым страницам при discovery.'
          : 'Проверка общедоступных страниц без авторизации.';
        document.querySelector('[data-setup-ready]').textContent = saved
          ? 'URL, спецификация и auth session подключены'
          : 'URL и спецификация подключены';
        animateIn(document.querySelector('.setup-ready'));
      }),
    );

    function activationY() {
      return Math.round(window.innerHeight * (window.innerWidth < 768 ? 0.65 : 0.5));
    }

    function cancelChapterSync() {
      if (chapterFrame) {
        window.cancelAnimationFrame(chapterFrame);
      }
      chapterFrame = 0;
    }

    function syncChapterFromPosition() {
      chapterFrame = 0;
      if (disposed || reducedMotion.matches) {
        return;
      }
      const anchor = activationY();
      // Read today's geometry once, never replay the order of old observer entries.
      const tops = chapters.map((chapter) => chapter.getBoundingClientRect().top);
      let next = 0;
      for (let index = 1; index < tops.length; index++) {
        if (tops[index] > anchor) {
          break;
        }
        next = index;
      }
      const current = chapters.findIndex(
        (chapter) => chapter.dataset.profileChapter === faultApp.dataset.profile,
      );
      // The small boundary margin absorbs trackpad jitter in both directions.
      if (next > current && tops[current + 1] > anchor - 16) {
        return;
      }
      if (next < current && tops[current] < anchor + 16) {
        return;
      }
      renderFault(chapters[next].dataset.profileChapter);
    }

    function scheduleChapterSync() {
      if (!disposed && !reducedMotion.matches && !chapterFrame) {
        chapterFrame = window.requestAnimationFrame(syncChapterFromPosition);
      }
    }

    function updateChapterMotion() {
      cancelChapterSync();
      chapterObserver?.disconnect();
      if (disposed || reducedMotion.matches || typeof window.IntersectionObserver !== 'function') {
        return;
      }
      const anchor = activationY();
      // A narrow, fixed activation band gives each chapter one stable boundary.
      // IntersectionObserver only wakes the controller; its queued ratios are ignored.
      chapterObserver = new window.IntersectionObserver(scheduleChapterSync, {
        rootMargin: `${-(anchor - 24)}px 0px ${-(window.innerHeight - anchor - 24)}px 0px`,
        threshold: 0,
      });
      chapters.forEach((chapter) => chapterObserver.observe(chapter));
      scheduleChapterSync();
    }

    function resizeStory() {
      if (resizeFrame) {
        return;
      }
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        updateChapterMotion();
      });
    }

    updateChapterMotion();
    reducedMotion.addEventListener('change', updateChapterMotion);
    window.addEventListener('resize', resizeStory);

    function onEnter(section) {
      const targets = section.querySelectorAll(
        '.how-step, .form-display, .setup-ready, .route-node, .endpoint-nodes li, .resilience-matrix tbody tr, .team-benefits article, .evidence-context > div',
      );
      targets.forEach((target, index) =>
        animateIn(target, { duration: 500, distance: 14, delay: index * 110 }),
      );
      if (section.id === 'setup' || section.id === 'discovery') {
        section.classList.add('scene-entered');
      }
    }

    renderMap('products', { animate: false });
    renderEvidence(currentResult);
    renderFault('healthy');
    window.addEventListener('pagehide', () => {
      disposed = true;
      settleFaultMotion();
      cancelChapterSync();
      if (resizeFrame) {
        window.cancelAnimationFrame(resizeFrame);
      }
      chapterObserver?.disconnect();
      reducedMotion.removeEventListener('change', updateChapterMotion);
      window.removeEventListener('resize', resizeStory);
    });
    return { onEnter, renderEvidence, renderMap };
  }

  function initDemoNavigation(runner, menu) {
    let navigating = false;
    const controller = new AbortController();
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-demo-launch]');
      if (!button) {
        return;
      }
      if (button.classList.contains('terminal-play') && runner.busy) {
        runner.cancel();
        return;
      }
      if (runner.busy || navigating) {
        return;
      }
      menu.close({ focus: false });
      navigating = true;
      const terminal = document.querySelector('#terminal');
      try {
        const rect = terminal.getBoundingClientRect();
        if (rect.top < 84 || rect.bottom > window.innerHeight) {
          terminal.scrollIntoView({
            behavior: reducedMotion.matches ? 'instant' : 'smooth',
            block: 'start',
          });
          await wait(550, controller.signal);
        }
        terminal.focus({ preventScroll: true });
        navigating = false;
        await runner.run();
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error(error);
        }
      } finally {
        navigating = false;
      }
    });
    window.addEventListener('pagehide', () => controller.abort());
  }

  Object.assign(window.FaultView, { initProductScenes, initDemoNavigation });
})();
