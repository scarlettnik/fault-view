import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { HashRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { App } from '../App';
import { createStore } from '../store';
it('moves focus to content without overwriting the hash route', async () => {
  window.location.hash = '/';
  render(
    <Provider store={createStore()}>
      <HashRouter>
        <App />
      </HashRouter>
    </Provider>,
  );
  screen.getByRole('main').scrollIntoView = vi.fn();
  const originalHash = window.location.hash;
  await userEvent.click(screen.getByRole('link', { name: 'К содержимому' }));
  expect(window.location.hash).toBe(originalHash);
  expect(screen.getByRole('main')).toHaveFocus();
});
