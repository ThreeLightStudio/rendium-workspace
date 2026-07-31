import type { Meta, StoryObj } from '@storybook/react';
import { PlayPauseButton } from './PlayPauseButton';

const noop = () => undefined;

const meta: Meta<typeof PlayPauseButton> = {
  title: 'Studio/Transport/PlayPauseButton',
  component: PlayPauseButton,
  args: {
    canPlay: true,
    isPlaying: false,
    onClick: noop,
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Play: Story = {};

export const Pause: Story = {
  args: {
    isPlaying: true,
  },
};
