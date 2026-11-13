(() => {
  'use strict';

  const { animateIn, reducedMotion } = window.FaultView;

  function initScrollReveal(onEnter) {
    const sections = [...document.querySelectorAll('[data-reveal]')];
    if (typeof window.IntersectionObserver !== 'function') {
      sections.forEach((section) => onEnter?.(section));
      return;
    }
    const observer = new window.IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }
          observer.unobserve(entry.target);
          const section = entry.target;
          if (!reducedMotion.matches) {
            animateIn(section.querySelector('h2'), {
              duration: 420,
              distance: window.innerWidth < 768 ? 8 : 16,
            });
            animateIn(
              section.querySelector('.section-heading > p, .case-copy > p, .final-cta > p'),
              {
                duration: 350,
                distance: 8,
                delay: 80,
              },
            );
            if (section.id === 'demo') {
              animateIn(section.querySelector('.button'), {
                duration: 220,
                distance: 8,
                delay: 100,
              });
            }
          }
          onEnter?.(section);
        });
      },
      { threshold: 0, rootMargin: '0px 0px -80px 0px' },
    );
    sections.forEach((section) => observer.observe(section));

    const heroObserver = new window.IntersectionObserver(
      ([entry]) => {
        document
          .querySelector('[data-header]')
          .classList.toggle('is-scrolled', !entry.isIntersecting);
      },
      { threshold: 0.1 },
    );
    heroObserver.observe(document.querySelector('.hero'));
    window.addEventListener('pagehide', () => {
      observer.disconnect();
      heroObserver.disconnect();
    });
  }

  Object.assign(window.FaultView, { initScrollReveal });
})();
