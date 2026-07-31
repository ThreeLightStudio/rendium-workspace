import type { Meta, StoryObj } from '@storybook/react';
import { formatTime } from './time';

const meta: Meta = {
  title: 'Foundations/Timing/Timecode',
};

export default meta;

type Story = StoryObj<typeof meta>;

const samples = [0, 5, 65, 601, 3599, 3605];

export const Timecode: Story = {
  render: () => (
    <div
      style={{
        padding: 24,
        background: 'linear-gradient(180deg, #10131a 0%, #0b0d12 100%)',
        color: 'rgba(255,255,245,0.92)',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>MM:SS Formatter</h2>
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
            <th style={cellHead}>Seconds</th>
            <th style={cellHead}>Formatted</th>
          </tr>
        </thead>
        <tbody>
          {samples.map((seconds) => (
            <tr key={seconds} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <td style={cellBody}>{seconds}</td>
              <td style={cellBody}>{formatTime(seconds)}</td>
            </tr>
          ))}
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
};
