import type { Meta, StoryObj } from '@storybook/react';
import { InspectorRangeInput } from './ui';

const noop = () => undefined;

const meta: Meta<typeof InspectorRangeInput> = {
  title: 'Design System/Inputs/RangeInput',
  component: InspectorRangeInput,
  args: {
    min: 0,
    max: 100,
    step: 1,
    value: 48,
    onChange: noop,
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
