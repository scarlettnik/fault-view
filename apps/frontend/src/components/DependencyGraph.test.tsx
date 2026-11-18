import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { DependencyGraph } from './DependencyGraph';
import type { Graph } from '../core/model';

const graph: Graph = {
  title: 'test',
  routes: [{ id: '/shop', url: 'http://localhost/shop', status: 'visited' }],
  endpoints: [
    { id: 'GET /api/items', method: 'GET', path: '/api/items', servers: ['http://localhost'] },
  ],
  routeDependencies: [
    { routeId: '/shop', endpointId: 'GET /api/items', provenance: 'local-fixture' },
  ],
  operationLinks: [],
  warnings: [],
  coverage: {
    visitedPages: 1,
    pendingPages: 0,
    maxPages: 10,
    complete: true,
    scope: 'local-simulation',
  },
};
it('selects a node by keyboard, links to its cascade and excludes/restores without inventing edges', async () => {
  const user = userEvent.setup();
  const exclude = vi.fn();
  const restore = vi.fn();
  const { rerender } = render(
    <MemoryRouter>
      <DependencyGraph
        graph={graph}
        projectId="p"
        excluded={[]}
        search=""
        showExcluded={false}
        onExclude={exclude}
        onRestore={restore}
      />
    </MemoryRouter>,
  );
  screen.getByRole('button', { name: 'Страница /shop' }).focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('link', { name: 'Настроить проверку' })).toHaveAttribute(
    'href',
    '/projects/p/plans?mode=route&target=%2Fshop',
  );
  expect(document.querySelectorAll('.graph-edge.observed')).toHaveLength(1);
  expect(document.querySelectorAll('.graph-edge.declared')).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: 'Исключить страницу' }));
  expect(exclude).toHaveBeenCalledWith('/shop');
  rerender(
    <MemoryRouter>
      <DependencyGraph
        graph={graph}
        projectId="p"
        excluded={['/shop']}
        search="absent"
        showExcluded
        onExclude={exclude}
        onRestore={restore}
      />
    </MemoryRouter>,
  );
  expect(screen.getByRole('status', { name: 'Результаты поиска графа' })).toHaveTextContent(
    'Найдено узлов: 0',
  );
  await user.click(screen.getByRole('button', { name: 'Вернуть страницу в проверки' }));
  expect(restore).toHaveBeenCalledWith('/shop');
  await user.click(screen.getByRole('button', { name: 'Увеличить граф' }));
  expect(screen.getByLabelText('Масштаб графа')).toHaveTextContent('120%');
});
