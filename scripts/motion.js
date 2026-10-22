(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set();

  function animateIn(element, { duration = 180, distance = 4, delay = 0, fromOpacity = 0 } = {}) {
    if (!element || reducedMotion.matches || !element.animate) {
      return;
    }
    const animation = element.animate(
      [
        { opacity: fromOpacity, transform: `translateY(${distance}px)` },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration, delay, fill: 'backwards', easing: 'cubic-bezier(.22, 1, .36, 1)' },
    );
    animations.add(animation);
    const cleanup = () => animations.delete(animation);
    animation.finished?.catch(cleanup);
    animation.ready?.catch(cleanup);
    animation.addEventListener('finish', cleanup, { once: true });
    animation.addEventListener('cancel', cleanup, { once: true });
    return animation;
  }

  function wait(ms, signal) {
    if (signal?.aborted) {
      return Promise.reject(new DOMException('Cancelled', 'AbortError'));
    }
    if (reducedMotion.matches) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        reducedMotion.removeEventListener('change', changed);
      };
      const finish = () => {
        cleanup();
        resolve();
      };
      const abort = () => {
        cleanup();
        reject(new DOMException('Cancelled', 'AbortError'));
      };
      const changed = () => {
        if (reducedMotion.matches) {
          finish();
        }
      };
      const timer = setTimeout(finish, ms);
      signal?.addEventListener('abort', abort, { once: true });
      reducedMotion.addEventListener('change', changed);
    });
  }

  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      animations.forEach((animation) => animation.cancel());
    }
  });
  window.addEventListener('pagehide', () => animations.forEach((animation) => animation.cancel()));

  window.FaultView = { reducedMotion, animateIn, wait };
})();
