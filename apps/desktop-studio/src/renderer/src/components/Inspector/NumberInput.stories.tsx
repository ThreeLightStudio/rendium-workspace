import type { Meta, StoryObj } from '@storybook/react';
import { InspectorNumberInput } from './ui';

const noop = () => undefined;

const meta: Meta<typeof InspectorNumberInput> = {
  title: 'Design System/Inputs/NumberInput',
  component: InspectorNumberInput,
  args: {
    value: 42,
    min: 0,
    max: 100,
    step: 1,
    onChange: noop,
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Compact: Story = {
  args: {
    density: 'compact',
    value: 7,
  },
};
