import type { Meta, StoryObj } from '@storybook/react';
import { InspectorToggleGroup } from './ui';

const noop = () => undefined;

const meta: Meta<typeof InspectorToggleGroup> = {
  title: 'Design System/Inputs/ToggleGroup',
  component: InspectorToggleGroup,
  args: {
    value: 'fit',
    onChange: noop,
    options: [
      { value: 'fit', label: 'Fit' },
      { value: 'fill', label: 'Fill' },
      { value: 'stretch', label: 'Stretch' },
    ],
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WarningTone: Story = {
  args: {
    tone: 'warning',
  },
};
