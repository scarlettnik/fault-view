import type { Meta, StoryObj } from '@storybook/react-vite';
import { Notice } from './ui';
const meta = {
  title: 'UI/Notice',
  component: Notice,
  args: { children: 'Локальный сценарий сохранён.', kind: 'success' },
} satisfies Meta<typeof Notice>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Success: Story = {};
export const Error: Story = {
  args: { kind: 'error', children: 'Не удалось прочитать спецификацию.' },
};
