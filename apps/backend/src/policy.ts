import { InputError } from './types.js';

export function httpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InputError('Нужен абсолютный HTTP(S) URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new InputError('Нужен HTTP(S) URL без имени пользователя и пароля.');
  }
  return url;
}

export function networkPolicy(origins: string[]) {
  const allowed = new Set(
    origins.map((raw) => {
      const url = httpUrl(raw);
      if (url.pathname !== '/' || url.search || url.hash)
        throw new Error('Target allowlist принимает только origin.');
      return url.origin;
    }),
  );
  return {
    allows(raw: string): boolean {
      try {
        return allowed.has(httpUrl(raw).origin);
      } catch {
        return false;
      }
    },
    assert(raw: string): void {
      if (!this.allows(raw))
        throw new InputError(
          'Origin не разрешён в FAULTVIEW_TARGET_ORIGINS.',
          'TARGET_NOT_ALLOWED',
          403,
        );
    },
  };
}

export function publicUrl(raw: string): string {
  const url = httpUrl(raw);
  let routeHash = '';
  // HashRouter/AngularJS routes are pages; ordinary #section anchors are not.
  const route = url.hash.match(/^#(!?)(\/(?!\/).*)$/);
  if (route) {
    const path = new URL(route[2]!, url.origin).pathname;
    if (path !== '/') routeHash = `#${route[1]}${path}`;
  }
  return `${url.origin}${url.pathname}${routeHash}`;
}
