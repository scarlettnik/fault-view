import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ProjectForm } from './ProjectForm';

it('validates fields and saves a user-supplied OpenAPI file without starting a scan', async () => {
  const onSave = vi.fn();
  const user = userEvent.setup();
  render(<ProjectForm onSave={onSave} />);
  await user.click(screen.getByRole('button', { name: 'Сохранить проект' }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText('Укажите название проекта.')).toBeVisible();
  await user.type(screen.getByLabelText('Название проекта'), 'My Shop');
  await user.type(screen.getByLabelText('Адрес приложения'), 'http://localhost:4200');
  await user.upload(
    screen.getByLabelText('Файл OpenAPI'),
    new File(
      [
        'openapi: 3.0.3\ninfo: {title: Shop, version: "1"}\npaths: {/items: {get: {responses: {"200": {description: OK}}}}}',
      ],
      'shop.yaml',
      { type: 'application/yaml' },
    ),
  );
  await user.click(screen.getByRole('button', { name: 'Сохранить проект' }));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'My Shop',
        specificationName: 'shop.yaml',
        specification: expect.stringContaining('openapi:'),
      }),
    ),
  );
});

it('rejects an unsupported or oversized file and keeps the form editable', async () => {
  const user = userEvent.setup({ applyAccept: false });
  render(<ProjectForm onSave={vi.fn()} />);
  await user.upload(screen.getByLabelText('Файл OpenAPI'), new File(['not an api'], 'project.exe'));
  expect(await screen.findByRole('alert')).toHaveTextContent('JSON, YAML или YML');
});

it('rejects an incomplete OpenAPI document before saving', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(<ProjectForm onSave={onSave} />);
  await user.type(screen.getByLabelText('Название проекта'), 'Broken');
  await user.type(screen.getByLabelText('Адрес приложения'), 'https://shop.example');
  await user.upload(
    screen.getByLabelText('Файл OpenAPI'),
    new File(['{"openapi":"3.0.3"}'], 'broken.json', { type: 'application/json' }),
  );
  await user.click(screen.getByRole('button', { name: 'Сохранить проект' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('info.title');
  expect(onSave).not.toHaveBeenCalled();
});
