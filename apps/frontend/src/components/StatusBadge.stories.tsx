import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusBadge } from './ui';
const meta = {
  title: 'UI/StatusBadge',
  component: StatusBadge,
  args: { status: 'completed' },
} satisfies Meta<typeof StatusBadge>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Completed: Story = {};
export const Running: Story = { args: { status: 'running' } };
export const Failed: Story = { args: { status: 'failed' } };
