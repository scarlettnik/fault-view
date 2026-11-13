(() => {
  'use strict';

  function initMobileMenu(header) {
    const trigger = header.querySelector('.menu-trigger');
    const nav = header.querySelector('.site-nav');
    const backdrop = header.querySelector('.menu-backdrop');
    const mobile = window.matchMedia('(max-width: 767px)');
    const background = [document.querySelector('main'), document.querySelector('footer')];
    let open = false;

    function close({ focus = true } = {}) {
      if (!open) {
        return;
      }
      open = false;
      nav.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-label', 'Открыть меню');
      backdrop.hidden = true;
      document.body.classList.remove('menu-open');
      background.forEach((element) => {
        element.inert = false;
      });
      if (focus && mobile.matches) {
        trigger.focus({ preventScroll: true });
      }
    }

    function toggle() {
      if (open) {
        close();
        return;
      }
      open = true;
      nav.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      trigger.setAttribute('aria-label', 'Закрыть меню');
      backdrop.hidden = false;
      document.body.classList.add('menu-open');
      background.forEach((element) => {
        element.inert = true;
      });
      nav.querySelector('a').focus({ preventScroll: true });
    }

    function updateViewport() {
      const triggerHadFocus = document.activeElement === trigger;
      if (!mobile.matches) {
        close({ focus: false });
      }
      trigger.hidden = !mobile.matches;
      if (!mobile.matches && triggerHadFocus) {
        nav.querySelector('a').focus({ preventScroll: true });
      }
    }

    header.classList.add('has-menu');
    updateViewport();
    mobile.addEventListener('change', updateViewport);
    trigger.addEventListener('click', toggle);
    backdrop.addEventListener('click', () => close());
    header.addEventListener('click', (event) => {
      if (event.target.closest('a, [data-demo-launch]')) {
        close();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (!open) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
      if (event.key !== 'Tab') {
        return;
      }
      const focusable = [trigger, ...nav.querySelectorAll('a, button:not(:disabled)')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    document.addEventListener('pointerdown', (event) => {
      if (open && !header.contains(event.target)) {
        close();
      }
    });
    return { close };
  }

  Object.assign(window.FaultView, { initMobileMenu });
})();
