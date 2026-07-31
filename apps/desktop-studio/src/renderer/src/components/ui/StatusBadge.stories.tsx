import type { Meta, StoryObj } from '@storybook/react';
import { StatusBadge } from './StatusBadge';

const meta: Meta<typeof StatusBadge> = {
  title: 'Design System/Display/StatusBadge',
  component: StatusBadge,
  args: {
    children: 'EN',
    active: false,
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Active: Story = {
  args: {
    active: true,
    children: 'KO',
  },
};
