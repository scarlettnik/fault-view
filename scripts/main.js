(() => {
  'use strict';

  const {
    createTerminalDemo,
    initMobileMenu,
    initProductScenes,
    initDemoNavigation,
    initScrollReveal,
  } = window.FaultView;

  const menu = initMobileMenu(document.querySelector('[data-header]'));
  const scenes = initProductScenes();
  const runner = createTerminalDemo(document.querySelector('#terminal'), (result) => {
    scenes.renderEvidence(result);
    scenes.renderMap(result.route.id);
  });
  initDemoNavigation(runner, menu);
  initScrollReveal(scenes.onEnter);
})();
