const ok = (body) => ({ status: 200, body });
const missing = () => ({
  status: 404,
  body: { error: 'Resource not found in local demo', errors: { body: ['Not found'] } },
});
const nextId = (rows) => Math.max(0, ...rows.map((row) => Number(row.id) || 0)) + 1;
const clean = (value, limit = 5000) => (typeof value === 'string' ? value.slice(0, limit) : '');

export function initialState(id, fixtures) {
  const user = {
    username: 'demo',
    email: 'demo@example.test',
    bio: 'Local demonstration account',
    image: '',
    token: 'local-demo-token',
  };
  return {
    fault: 'healthy',
    tasks: [
      {
        id: 1,
        title: 'Check the catalogue',
        description: 'Baseline scenario',
        text: 'Check the catalogue',
      },
      {
        id: 2,
        title: 'Inspect API dependencies',
        description: 'Build a dependency graph',
        text: 'Inspect API dependencies',
      },
      {
        id: 3,
        title: 'Recover after a failure',
        description: 'Repeat the request',
        text: 'Recover after a failure',
      },
    ],
    owners: structuredClone(fixtures.petclinic.owners),
    vets: structuredClone(fixtures.petclinic.vets),
    pets: structuredClone(fixtures.petclinic.pets),
    user,
    articles: [
      {
        slug: 'welcome-to-realworld',
        title: 'Welcome to RealWorld',
        description: 'The original Conduit frontend with local API responses.',
        body: 'This published example runs the original Conduit components. On GitHub Pages only the API responses are provided locally.',
        tagList: ['demo', 'frontend'],
        createdAt: '2026-11-14T10:00:00Z',
        updatedAt: '2026-11-14T10:00:00Z',
        favorited: false,
        favoritesCount: 0,
        author: { ...user, following: false },
      },
    ],
    comments: {},
    cart: { items: [], total: 0, tax: 0 },
    id,
  };
}

export function apiResponse(id, path, method, body, query, state, fixtures) {
  if (id === 'storefront')
    return method === 'GET' && path in fixtures.storefront
      ? ok(fixtures.storefront[path])
      : missing();
  if (id === 'todo' || id === 'react-express-mongodb') {
    const expected = id === 'todo' ? '/api/tutorials' : '/api/todos';
    if (id === 'react-express-mongodb' && path === '/api' && method === 'GET')
      return ok({ data: state.tasks });
    if (path !== expected && !path.startsWith(`${expected}/`)) return missing();
    const key = path.slice(expected.length + 1);
    if (method === 'POST' && path === expected) {
      if (state.tasks.length >= 200)
        return { status: 400, body: { error: 'Demo record limit reached' } };
      const entry = {
        id: nextId(state.tasks),
        title: clean(body.title, 160),
        description: clean(body.description, 400),
        text: clean(body.text, 400),
      };
      state.tasks.push(entry);
      return ok({ result: entry, data: entry });
    }
    if (method === 'DELETE') {
      state.tasks = state.tasks.filter((row) => String(row.id) !== key);
      return ok({ success: true });
    }
    if (method === 'PUT') {
      const entry = state.tasks.find((row) => String(row.id) === key);
      if (!entry) return missing();
      entry.title = clean(body.title, 160);
      entry.description = clean(body.description, 400);
      return ok({ result: entry });
    }
    return method === 'GET' ? ok({ result: { rows: state.tasks }, data: state.tasks }) : missing();
  }
  if (id === 'petclinic') {
    const [, , resource, key] = path.split('/');
    if (resource === 'pettypes') return ok(fixtures.petclinic.types);
    if (resource === 'specialties') return ok(fixtures.petclinic.specialties);
    if (!['owners', 'vets', 'pets'].includes(resource)) return missing();
    const rows = state[resource];
    if (method === 'GET')
      return key
        ? rows.find((row) => String(row.id) === key)
          ? ok(rows.find((row) => String(row.id) === key))
          : missing()
        : ok(
            resource === 'owners' && query.get('lastName')
              ? rows.filter((row) =>
                  row.lastName.toLowerCase().includes(query.get('lastName').toLowerCase()),
                )
              : rows,
          );
    if (method === 'DELETE') {
      state[resource] = rows.filter((row) => String(row.id) !== key);
      return ok({});
    }
    const allowed =
      resource === 'owners'
        ? ['firstName', 'lastName', 'address', 'city', 'telephone']
        : resource === 'vets'
          ? ['firstName', 'lastName']
          : ['name', 'birthDate'];
    const value = Object.fromEntries(allowed.map((name) => [name, clean(body[name], 200)]));
    if (method === 'POST') {
      const row = {
        ...value,
        id: nextId(rows),
        ...(resource === 'owners'
          ? { pets: [] }
          : resource === 'vets'
            ? { specialties: [] }
            : { ownerId: body.ownerId, type: body.type, visits: [] }),
      };
      rows.push(row);
      return ok(row);
    }
    if (method === 'PUT') {
      const row = rows.find((item) => String(item.id) === key);
      if (!row) return missing();
      Object.assign(row, value);
      return ok(row);
    }
    return missing();
  }
  if (id === 'conduit') {
    if (path === '/api/tags')
      return ok({ tags: [...new Set(state.articles.flatMap((article) => article.tagList))] });
    if (['/api/user', '/api/users', '/api/users/login'].includes(path)) {
      if (method !== 'GET') {
        const input = body.user ?? {};
        for (const name of ['username', 'email', 'bio', 'image'])
          if (typeof input[name] === 'string') state.user[name] = clean(input[name], 500);
      }
      return ok({ user: state.user });
    }
    if (path.startsWith('/api/profiles/'))
      return ok({ profile: { ...state.user, following: method === 'POST' } });
    if (!path.startsWith('/api/articles')) return missing();
    const [, , , slug, action, commentId] = path.split('/');
    const article = state.articles.find((row) => row.slug === slug);
    if (action === 'comments') {
      const comments = (state.comments[slug] ??= []);
      if (method === 'POST')
        comments.push({
          id: nextId(comments),
          body: clean(body.comment?.body),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: state.user,
        });
      if (method === 'DELETE')
        state.comments[slug] = comments.filter((row) => String(row.id) !== commentId);
      return ok(
        method === 'POST' ? { comment: comments.at(-1) } : { comments: state.comments[slug] },
      );
    }
    if (action === 'favorite' && article) {
      article.favorited = method === 'POST';
      article.favoritesCount = article.favorited ? 1 : 0;
      return ok({ article });
    }
    if (method === 'POST' && !slug) {
      if (state.articles.length >= 200)
        return { status: 400, body: { errors: { body: ['Demo limit reached'] } } };
      const input = body.article ?? {};
      const created = {
        title: clean(input.title, 160),
        description: clean(input.description, 400),
        body: clean(input.body),
        tagList: Array.isArray(input.tagList)
          ? input.tagList.filter((tag) => typeof tag === 'string').slice(0, 20)
          : [],
        slug: `demo-${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        favorited: false,
        favoritesCount: 0,
        author: { ...state.user, following: false },
      };
      state.articles.unshift(created);
      return ok({ article: created });
    }
    if (method === 'PUT' && article) {
      for (const name of ['title', 'description', 'body'])
        article[name] = clean(body.article?.[name]);
      return ok({ article });
    }
    if (method === 'DELETE' && article) {
      state.articles = state.articles.filter((row) => row !== article);
      return ok({});
    }
    if (slug && slug !== 'feed') return article ? ok({ article }) : missing();
    const articles = state.articles.filter(
      (row) => !query.get('tag') || row.tagList.includes(query.get('tag')),
    );
    const offset = Math.max(0, Number(query.get('offset')) || 0);
    const limit = Math.min(50, Math.max(1, Number(query.get('limit')) || 10));
    return ok({ articles: articles.slice(offset, offset + limit), articlesCount: articles.length });
  }
  if (id === 'robot-shop') {
    const products = fixtures.robotProducts;
    const pieces = path.split('/');
    if (path === '/api/catalogue/categories')
      return ok([...new Set(products.flatMap((product) => product.categories))]);
    if (path === '/api/catalogue/products') return ok(products);
    if (path.startsWith('/api/catalogue/products/'))
      return ok(
        products.filter((product) =>
          product.categories.includes(decodeURIComponent(pieces.at(-1))),
        ),
      );
    if (path.startsWith('/api/catalogue/search/'))
      return ok(
        products.filter((product) =>
          product.name.toLowerCase().includes(decodeURIComponent(pieces.at(-1)).toLowerCase()),
        ),
      );
    if (path.startsWith('/api/catalogue/product/'))
      return products.find((product) => product.sku === pieces.at(-1))
        ? ok(products.find((product) => product.sku === pieces.at(-1)))
        : missing();
    if (path.includes('/ratings/')) return ok({ avg_rating: 4, rating_count: 1 });
    if (path === '/api/user/uniqueid') return ok({ uuid: 'anonymous-demo' });
    if (path === '/api/user/login' || path === '/api/user/register')
      return ok({
        name: clean(body.name, 80) || 'demo',
        email: clean(body.email, 120) || 'demo@example.test',
      });
    if (path.includes('/user/history/')) return ok({ history: [] });
    if (path.includes('/cart/')) {
      if (path.includes('/add/') || path.includes('/update/')) {
        const sku = pieces.at(-2);
        const qty = Math.min(10, Math.max(0, Number(pieces.at(-1)) || 0));
        const product = products.find((row) => row.sku === sku);
        if (product) {
          const current = state.cart.items.find((row) => row.sku === sku);
          const amount = path.includes('/add/') ? (current?.qty ?? 0) + qty : qty;
          state.cart.items = state.cart.items.filter((row) => row.sku !== sku);
          if (amount)
            state.cart.items.push({
              sku,
              name: product.name,
              qty: amount,
              price: product.price,
              subtotal: amount * product.price,
            });
        }
        state.cart.total = state.cart.items.reduce((sum, row) => sum + row.subtotal, 0);
        state.cart.tax = state.cart.total * 0.2;
      }
      return ok(state.cart);
    }
    if (path === '/api/shipping/codes')
      return ok([
        { code: 'GB', name: 'United Kingdom' },
        { code: 'US', name: 'United States' },
      ]);
    if (path.includes('/shipping/match/')) return ok([{ uuid: 'demo-city', name: 'London' }]);
    if (path.includes('/shipping/calc/')) return ok({ distance: 10, cost: 5 });
    if (path.includes('/shipping/confirm/')) return ok(state.cart);
    if (path.includes('/payment/pay/')) {
      state.cart = { items: [], total: 0, tax: 0 };
      return ok({ orderid: 'demo-order' });
    }
    return missing();
  }
  return missing();
}
