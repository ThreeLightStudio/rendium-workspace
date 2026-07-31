import type { Meta, StoryObj } from '@storybook/react';
import { InspectorColorInput } from './ui';

const noop = () => undefined;

const meta: Meta<typeof InspectorColorInput> = {
  title: 'Design System/Inputs/ColorInput',
  component: InspectorColorInput,
  args: {
    value: '#00d4ff',
    onChange: noop,
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
