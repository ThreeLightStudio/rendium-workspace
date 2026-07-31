import type { Meta, StoryObj } from '@storybook/react';
import {
  TIMELINE_SOFT_TARGET_SECONDS,
  clampTimelineExtent,
  getPlaybackFollowScrollLeft,
  getTimelineMinPxPerSec,
} from './timelineViewport';

const meta: Meta = {
  title: 'Foundations/Timing/FrameRateGuide',
};

export default meta;

type Story = StoryObj<typeof meta>;

const examples = [
  { viewportWidth: 1280, currentTime: 18, pxPerSec: 48, scrollLeft: 0, timelineExtent: 90 },
  { viewportWidth: 1920, currentTime: 250, pxPerSec: 10, scrollLeft: 0, timelineExtent: 1000 },
  { viewportWidth: 2560, currentTime: 40, pxPerSec: 24, scrollLeft: 420, timelineExtent: 3600 },
];

export const FrameRateGuide: Story = {
  render: () => (
    <div
      style={{
        padding: 24,
        background: 'linear-gradient(180deg, #0f1118 0%, #0b0d12 100%)',
        color: 'rgba(255,255,245,0.92)',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>Timeline Viewport Guide</h2>
      <p style={{ margin: '0 0 16px', color: 'rgba(255,255,245,0.7)', maxWidth: 760 }}>
        The timeline keeps a soft duration floor of {TIMELINE_SOFT_TARGET_SECONDS} seconds and
        derives a minimum zoom level from the visible viewport width.
      </p>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <thead>
          <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
            <th style={cellHead}>Viewport</th>
            <th style={cellHead}>Min px/sec</th>
            <th style={cellHead}>Clamped extent</th>
            <th style={cellHead}>Follow scroll</th>
          </tr>
        </thead>
        <tbody>
          {examples.map((example) => {
            const nextScroll = getPlaybackFollowScrollLeft(example);
            return (
              <tr key={`${example.viewportWidth}-${example.currentTime}`}>
                <td style={cellBody}>{example.viewportWidth}px</td>
                <td style={cellBody}>{getTimelineMinPxPerSec(example.viewportWidth).toFixed(4)}</td>
                <td style={cellBody}>{clampTimelineExtent(example.timelineExtent)}s</td>
                <td style={cellBody}>
                  {nextScroll === null ? 'stay put' : `${nextScroll.toFixed(1)}px`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ),
};

const cellHead: React.CSSProperties = {
  padding: '12px 14px',
  textAlign: 'left',
  fontSize: 13,
  color: 'rgba(255,255,245,0.72)',
};

const cellBody: React.CSSProperties = {
  padding: '12px 14px',
  textAlign: 'left',
  fontSize: 14,
  fontVariantNumeric: 'tabular-nums',
  borderTop: '1px solid rgba(255,255,255,0.06)',
};
