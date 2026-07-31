import type { Meta, StoryObj } from '@storybook/react';
import { InspectorTextArea } from './ui';

const noop = () => undefined;

const meta: Meta<typeof InspectorTextArea> = {
  title: 'Design System/Inputs/TextArea',
  component: InspectorTextArea,
  args: {
    value: 'A short description of the current layer.',
    onChange: noop,
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
