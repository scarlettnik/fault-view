import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
const meta = {
  title: 'UI/Button',
  component: Button,
  args: { children: 'Сохранить', variant: 'primary' },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Primary: Story = {};
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Disabled: Story = { args: { disabled: true } };
export const Loading: Story = { args: { busy: true } };
