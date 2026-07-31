import type { Meta, StoryObj } from '@storybook/react';
import { InspectorSelect } from './ui';

const noop = () => undefined;

const meta: Meta<typeof InspectorSelect> = {
  title: 'Design System/Inputs/Select',
  component: InspectorSelect,
  args: {
    value: 'medium',
    onChange: noop,
    children: (
      <>
        <option value="small">Small</option>
        <option value="medium">Medium</option>
        <option value="large">Large</option>
      </>
    ),
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
