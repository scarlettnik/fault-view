const scriptUrl = new URL(import.meta.url);
const examplesBase = new URL('../', scriptUrl);
const siteBase = new URL('../', examplesBase);
const id = location.pathname.slice(examplesBase.pathname.length).split('/')[0];
const profiles = [
  'healthy',
  'latency',
  'http500',
  'http503',
  'timeout',
  'networkError',
  'recovery',
];
const selected = new URL(location.href).searchParams.get('fault') ?? 'healthy';
const parameters = new URL(location.href).searchParams;
window.__faultviewInjectionEvents = [];
navigator.serviceWorker?.addEventListener('message', (event) => {
  if (event.data?.type === 'faultview:injected' && window.__faultviewInjectionEvents.length < 200)
    window.__faultviewInjectionEvents.push(event.data);
});
const bar = document.createElement('aside');
bar.setAttribute('aria-label', 'Демонстрационный режим');
bar.style.cssText =
  'position:relative;z-index:10000;padding:12px 18px;background:#171c22;color:white;font:13px/1.6 system-ui;display:flex;gap:16px;flex-wrap:wrap;align-items:center;';
const note = document.createElement('span');
note.textContent = 'Оригинальный frontend · локальные ответы API';
bar.append(note);
for (const [label, url] of [
  ['Все проекты', examplesBase],
  ['FaultView', new URL('app/', siteBase)],
]) {
  const link = document.createElement('a');
  link.href = url.href;
  link.textContent = label;
  link.style.color = '#d3f7aa';
  bar.append(link);
}
const label = document.createElement('label');
label.textContent = 'Сценарий API: ';
const select = document.createElement('select');
select.setAttribute('aria-label', 'Сценарий API');
select.style.cssText = 'color:#171c22;background:white;padding:4px;';
for (const profile of profiles)
  select.add(new Option(profile, profile, false, selected === profile));
select.addEventListener('change', () => {
  const url = new URL(location.href);
  url.searchParams.set('fault', select.value);
  location.assign(url.href);
});
label.append(select);
bar.append(label);
document.body.prepend(bar);

try {
  if (!('serviceWorker' in navigator))
    throw new Error(
      'Для автономного режима нужен браузер с Service Worker и HTTPS либо localhost.',
    );
  const sw = new URL('../sw.js', scriptUrl);
  await navigator.serviceWorker.register(sw, { type: 'module', scope: examplesBase.pathname });
  await navigator.serviceWorker.ready;
  if (navigator.serviceWorker.controller?.scriptURL !== sw.href) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Не удалось запустить локальный адаптер API. Обновите страницу.')),
        10_000,
      );
      const check = () => {
        if (navigator.serviceWorker.controller?.scriptURL !== sw.href) return;
        clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener('controllerchange', check);
        resolve();
      };
      navigator.serviceWorker.addEventListener('controllerchange', check);
      check();
    });
  }
  const configured = await fetch(
    new URL(
      `_control/${id}?fault=${encodeURIComponent(selected)}&target=${encodeURIComponent(parameters.get('target') ?? '')}&live=${parameters.get('live') === '1' ? '1' : '0'}`,
      examplesBase,
    ),
  );
  if (!configured.ok) throw new Error('Не удалось настроить локальные ответы API.');
  // Replay original application scripts in their original order after the adapter is active.
  for (const placeholder of document.querySelectorAll('script[type="application/x-faultview"]')) {
    const script = document.createElement('script');
    const type = placeholder.getAttribute('data-original-type');
    if (type) script.type = type;
    for (const { name, value } of placeholder.attributes) {
      if (!['type', 'data-original-type', 'data-original-src', 'async', 'defer'].includes(name))
        script.setAttribute(name, value);
    }
    const src = placeholder.getAttribute('data-original-src');
    if (src) {
      script.src = src;
      script.async = false;
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Не удалось загрузить исходный скрипт ${src}`));
        placeholder.replaceWith(script);
      });
    } else {
      script.textContent = placeholder.textContent;
      placeholder.replaceWith(script);
    }
  }
  if (id === 'robot-shop') window.angular.bootstrap(document.body, ['robotshop']);
  document.documentElement.dataset.examplesReady = id;
} catch (error) {
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = error instanceof Error ? error.message : 'Ошибка запуска примера.';
  bar.append(message);
}
