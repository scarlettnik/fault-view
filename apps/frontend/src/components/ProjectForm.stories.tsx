import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProjectForm } from './ProjectForm';
import { createExampleProject } from '../core/examples';
const meta = {
  title: 'Forms/ProjectForm',
  component: ProjectForm,
  args: { onSave: () => undefined },
} satisfies Meta<typeof ProjectForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const Filled: Story = {
  args: { initial: { ...createExampleProject(), frontendUrl: 'https://storefront.example' } },
};
