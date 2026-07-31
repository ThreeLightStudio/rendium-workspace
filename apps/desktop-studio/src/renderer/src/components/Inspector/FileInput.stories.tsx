import type { Meta, StoryObj } from '@storybook/react';
import { InspectorFileInput } from './ui';

const noop = () => undefined;

const meta: Meta<typeof InspectorFileInput> = {
  title: 'Design System/Inputs/FileInput',
  component: InspectorFileInput,
  args: {
    onChange: noop,
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => <InspectorFileInput {...args} />,
};
