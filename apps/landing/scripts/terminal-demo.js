(() => {
  'use strict';

  const { getResult, createTabs, animateIn, wait } = window.FaultView;

  function createTerminalDemo(root, onComplete) {
    const rows = [...root.querySelectorAll('[data-stage]')];
    const launches = [...document.querySelectorAll('[data-demo-launch]')];
    const play = root.querySelector('.terminal-play');
    const routeSelect = root.querySelector('[data-demo-route]');
    const profileSelect = root.querySelector('[data-demo-profile]');
    const tabs = createTabs(root.querySelector('[data-tabs]'));
    let controller;
    let state = 'idle';
    let explored = false;
    root.querySelector('[data-tabs]').addEventListener('click', () => {
      explored = true;
    });
    root.querySelector('[data-tabs]').addEventListener('keydown', () => {
      explored = true;
    });

    function setState(next) {
      state = next;
      root.dataset.state = state;
      const busy = state === 'preparing' || state === 'running';
      launches.forEach((button) => {
        button.disabled = busy && button !== play;
      });
      routeSelect.disabled = busy;
      profileSelect.disabled = busy;
      play.setAttribute('aria-label', busy ? 'Остановить демо' : 'Запустить сценарий');
      root.querySelector('[data-play-label]').textContent = busy
        ? 'Стоп'
        : state === 'completed'
          ? 'Повтор'
          : 'Run';
      root.querySelector('[data-terminal-state]').textContent = {
        idle: 'Готов к запуску',
        preparing: 'Открываем страницу',
        running: 'Проверяем устойчивость',
        completed: 'Сценарий завершён',
        cancelled: 'Остановлено',
      }[state];
    }

    function showOutcome(result) {
      root.dataset.verdict = result.verdict;
      root.querySelector('[data-demo-status]').textContent =
        `${result.verdict.toUpperCase()} · ${result.route.path} · ${result.profile.label}`;
      root.querySelector('[data-terminal-result]').textContent = result.issue;
      const app = root.querySelector('[data-terminal-app]');
      app.dataset.verdict = result.verdict;
      app.querySelector('[data-app-state]').textContent =
        result.verdict === 'fail'
          ? 'Не удалось загрузить страницу'
          : result.verdict === 'warn'
            ? 'Загрузка занимает больше времени'
            : result.profile.id === 'recovery'
              ? 'Соединение восстановлено'
              : `${result.route.name}: доступно`;
      root.querySelector('[data-terminal-network]').textContent =
        `GET ${result.route.target}\n${result.profile.network}\n${result.profile.duration}`;
      root.querySelector('[data-open-result]').hidden = false;
      root.querySelector('[data-announcement]').textContent =
        `Сценарий завершён. ${result.verdict.toUpperCase()}. ${result.issue}`;
      onComplete(result);
    }

    function reset() {
      explored = false;
      root.removeAttribute('data-verdict');
      root.querySelector('[data-terminal-app]').dataset.verdict = 'idle';
      root.querySelector('[data-app-state]').textContent = 'Ожидает проверки';
      root.querySelector('[data-terminal-result]').textContent =
        'Результат появится после запуска сценария.';
      root.querySelector('[data-terminal-network]').textContent =
        'Выберите страницу и профиль отказа.';
      root.querySelector('[data-demo-status]').textContent = 'Discovery → Simulate → Verify';
      root.querySelector('[data-announcement]').textContent = '';
      root.querySelector('[data-open-result]').hidden = true;
      root.style.setProperty('--run-progress', '0');
      rows.forEach((row) => {
        row.classList.remove('is-running', 'just-finished', 'is-error');
        row.querySelector('[data-stage-status]').textContent = '-';
      });
      tabs.select(0, { animate: false });
    }

    async function run() {
      if (state === 'preparing' || state === 'running') {
        return;
      }
      controller = new AbortController();
      const { signal } = controller;
      const result = getResult(routeSelect.value, profileSelect.value);
      reset();
      setState('preparing');
      try {
        await wait(350, signal);
        setState('running');
        const labels = [
          `${result.route.endpoints.length} API`,
          result.profile.label,
          result.verdict.toUpperCase(),
          'Собрано',
        ];
        for (const [index, row] of rows.entries()) {
          row.classList.add('is-running');
          root.style.setProperty('--run-progress', String((index + 1) / rows.length));
          await wait(450, signal);
          row.classList.remove('is-running');
          row.classList.add('just-finished');
          row.querySelector('[data-stage-status]').textContent = labels[index];
          if (index === 2 && result.verdict === 'fail') {
            row.classList.add('is-error');
          }
        }
        showOutcome(result);
        if (!explored && document.activeElement?.getAttribute('role') !== 'tab') {
          tabs.select(1);
        }
        animateIn(root.querySelector('[data-demo-status]'));
        setState('completed');
      } catch (error) {
        if (error.name !== 'AbortError') {
          setState('cancelled');
          root.querySelector('[data-demo-status]').textContent =
            'Не удалось завершить демо. Повторите запуск.';
          console.error(error);
        }
      }
    }

    function cancel() {
      if (state !== 'preparing' && state !== 'running') {
        return;
      }
      controller?.abort();
      rows.forEach((row) => row.classList.remove('is-running'));
      setState('cancelled');
      root.querySelector('[data-demo-status]').textContent =
        'Демо остановлено. Можно запустить снова.';
    }

    launches.forEach((button) => {
      button.disabled = false;
    });
    routeSelect.disabled = false;
    profileSelect.disabled = false;
    window.addEventListener('pagehide', cancel);
    return {
      run,
      cancel,
      get busy() {
        return state === 'preparing' || state === 'running';
      },
    };
  }

  Object.assign(window.FaultView, { createTerminalDemo });
})();
