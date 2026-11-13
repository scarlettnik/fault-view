(() => {
  'use strict';

  const { animateIn } = window.FaultView;

  function createTabs(root, { onUserChange, distance = 4 } = {}) {
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
    let index = Math.max(
      0,
      tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true'),
    );

    function select(next, { focus = false, user = false, animate = true } = {}) {
      const changed = index !== next;
      index = next;
      tabs.forEach((tab, position) => {
        const active = position === next;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        panels[position].hidden = !active;
      });
      root.querySelector('.tablist').style.setProperty('--tab-offset', `${next * 100}%`);
      if (focus) {
        tabs[next].focus({ preventScroll: true });
      }
      if (user) {
        onUserChange?.(next);
      }
      if (animate && changed) {
        animateIn(panels[next], {
          duration: root.dataset.tabs === 'evidence' ? 220 : 150,
          distance,
        });
      }
    }

    root.addEventListener('click', (event) => {
      const tab = event.target.closest('[role="tab"]');
      if (tab && root.contains(tab)) {
        select(tabs.indexOf(tab), { user: true });
      }
    });
    root.addEventListener('keydown', (event) => {
      const tab = event.target.closest('[role="tab"]');
      if (!tab) {
        return;
      }
      let next = tabs.indexOf(tab);
      if (event.key === 'ArrowRight') {
        next = (next + 1) % tabs.length;
      } else if (event.key === 'ArrowLeft') {
        next = (next - 1 + tabs.length) % tabs.length;
      } else if (event.key === 'Home') {
        next = 0;
      } else if (event.key === 'End') {
        next = tabs.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      select(next, { focus: true, user: true });
    });
    tabs.forEach((tab) => {
      tab.disabled = false;
    });
    select(index, { animate: false });
    return {
      select,
      get panel() {
        return panels[index];
      },
    };
  }

  Object.assign(window.FaultView, { createTabs });
})();
