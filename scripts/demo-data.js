(() => {
  'use strict';

  const profiles = [
    {
      id: 'healthy',
      label: 'Healthy',
      title: 'Сначала - здоровый интерфейс.',
      description:
        'Зафиксируйте исходное состояние. Так изменения при отказе можно сравнить с нормальной работой.',
      network: '200 OK',
      duration: '84 ms',
    },
    {
      id: 'latency',
      label: 'Latency',
      title: 'Ответ задержался. Пользователь остался?',
      description:
        'Добавьте задержку и проверьте, сохраняет ли страница контекст, пока ждёт данные.',
      network: '200 OK · +3 000 ms',
      duration: '3 084 ms',
    },
    {
      id: 'error',
      label: 'HTTP 500',
      title: 'Один endpoint упал. Что исчезло вместе с ним?',
      description:
        'Изолируйте отказ API. Каталог должен остаться доступным, даже если рекомендации не загрузились.',
      network: '500 Internal Server Error',
      duration: '92 ms',
    },
    {
      id: 'timeout',
      label: 'Timeout',
      title: 'Запрос не ответил. Ожидание закончилось?',
      description:
        'Проверьте таймаут, сообщение об ошибке и возможность повторить запрос без перезагрузки страницы.',
      network: 'net::ERR_TIMED_OUT',
      duration: '10 000 ms',
    },
    {
      id: 'recovery',
      label: 'Recovery',
      title: 'API восстановился. А страница?',
      description:
        'Верните доступность endpoint и проверьте, может ли интерфейс вернуться к работе после сбоя.',
      network: '200 OK · retry',
      duration: '87 ms',
    },
  ];
  const routes = [
    {
      id: 'products',
      path: '/products',
      name: 'Каталог',
      endpoints: ['/api/products', '/api/recommendations', '/api/cart'],
      target: '/api/recommendations',
      results: ['pass', 'warn', 'fail', 'fail', 'pass'],
    },
    {
      id: 'checkout',
      path: '/checkout',
      name: 'Оформление',
      endpoints: ['/api/cart', '/api/delivery', '/api/payment'],
      target: '/api/delivery',
      results: ['pass', 'warn', 'pass', 'warn', 'pass'],
    },
    {
      id: 'account',
      path: '/account',
      name: 'Личный кабинет',
      endpoints: ['/api/profile', '/api/orders'],
      target: '/api/orders',
      results: ['pass', 'pass', 'pass', 'warn', 'pass'],
    },
  ];

  function getResult(routeId, profileId) {
    const route = routes.find((item) => item.id === routeId) ?? routes[0];
    const profileIndex = Math.max(
      0,
      profiles.findIndex((item) => item.id === profileId),
    );
    const profile = profiles[profileIndex];
    const verdict = route.results[profileIndex];
    const issue =
      verdict === 'fail'
        ? `Ошибка зависимости ${route.target} прерывает рендер всей страницы. Изолируйте блок и добавьте локальный fallback.`
        : verdict === 'warn'
          ? 'Основной сценарий доступен, но состояние ожидания или повтор запроса требует внимания. Добавьте понятный статус и ограничьте время ожидания.'
          : profile.id === 'recovery'
            ? 'После восстановления API страница возвращается к работе: данные доступны, повторный запрос завершён.'
            : 'Основной сценарий доступен. Интерфейс сохраняет контекст и корректно обрабатывает состояние зависимости.';
    return { route, profile, verdict, issue };
  }

  Object.assign(window.FaultView, { routes, getResult });
})();
