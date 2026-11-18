import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Button } from './Button';
it('supports native clicks and prevents interaction while busy', async () => {
  const onClick = vi.fn();
  const user = userEvent.setup();
  const { rerender } = render(<Button onClick={onClick}>Сохранить</Button>);
  expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  await user.click(screen.getByRole('button'));
  expect(onClick).toHaveBeenCalledTimes(1);
  rerender(
    <Button busy onClick={onClick}>
      Сохранить
    </Button>,
  );
  expect(screen.getByRole('button')).toBeDisabled();
  expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  await user.click(screen.getByRole('button'));
  expect(onClick).toHaveBeenCalledTimes(1);
});
