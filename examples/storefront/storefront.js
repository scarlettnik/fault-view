const content = document.querySelector('#content');
content.dataset.faultviewState = 'loading';
const get = async (path) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
  return response.json();
};
const text = (tag, value, className) => {
  const element = document.createElement(tag);
  element.textContent = String(value);
  if (className) element.className = className;
  return element;
};
const heading = (title) => content.replaceChildren(text('p', 'THE EVERYDAY COLLECTION', 'label'), text('h1', title));

async function render() {
  const path = window.location.pathname;
  if (path === '/products' || path === '/') {
    // Intentionally fragile: recommendations should not take down the catalogue.
    const [products, recommendations] = await Promise.all([get('/api/products'), get('/api/recommendations')]);
    heading('Good things. Simply made.');
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const product of products) {
      const card = document.createElement('article'); card.className = 'item';
      card.append(text('div', '◌', 'shape'), text('p', product.category, 'label'), text('h2', product.name), text('p', `$${product.price}`));
      grid.append(card);
    }
    content.append(grid, text('p', `Recommended: ${recommendations.map((item) => item.name).join(', ')}`, 'notice'));
  } else if (path === '/checkout') {
    const cart = await get('/api/cart');
    heading('Your bag.');
    for (const item of cart.items) content.append(text('p', `${item.name} × ${item.quantity}`));
    content.append(text('h2', `Total $${cart.total}`));
    const recommendations = await get('/api/recommendations').catch(() => []);
    if (!recommendations.length) content.dataset.faultviewState = 'degraded';
    content.append(text('p', recommendations.length ? `You may also like ${recommendations[0].name}` : 'Recommendations are temporarily unavailable.', 'notice'));
  } else {
    heading('Your space.');
    const profile = await get('/api/profile').catch(() => null);
    if (!profile) content.dataset.faultviewState = 'degraded';
    content.append(text('p', profile ? `Welcome, ${profile.name}. You have ${profile.orders} orders.` : 'Profile unavailable. Please try again.', 'notice'));
  }
  if (content.dataset.faultviewState === 'loading') content.dataset.faultviewState = 'ready';
}
render().catch((error) => {
  content.dataset.faultviewState = 'error';
  console.error(error);
  heading('We couldn’t load this page.');
  content.append(text('p', 'Please try again later.', 'notice'));
});
