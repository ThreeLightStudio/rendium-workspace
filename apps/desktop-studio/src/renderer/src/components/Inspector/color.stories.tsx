import type { Meta, StoryObj } from '@storybook/react';
import { hexToRgba, rgbaToHex } from './color';

const meta: Meta = {
  title: 'Foundations/Color/InspectorPalette',
};

export default meta;

type Story = StoryObj<typeof meta>;

const samples = [
  { hex: '#00d4ff', alpha: 1 },
  { hex: '#7c3aed', alpha: 0.75 },
  { hex: '#2ad07a', alpha: 0.5 },
  { hex: '#ff4b4b', alpha: 0.35 },
];

export const InspectorPalette: Story = {
  render: () => (
    <div
      style={{
        padding: 24,
        background: 'linear-gradient(180deg, #0e1016 0%, #0b0d12 100%)',
        color: 'rgba(255,255,245,0.92)',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>Inspector Color Conversions</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        {samples.map((sample) => {
          const rgba = hexToRgba(sample.hex, sample.alpha);
          return (
            <div
              key={`${sample.hex}-${sample.alpha}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr',
                gap: 12,
                alignItems: 'center',
                padding: 12,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)',
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 48,
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: sample.hex,
                  opacity: sample.alpha,
                }}
              />
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontWeight: 700 }}>{sample.hex}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,245,0.68)' }}>
                  rgbaToHex: {rgbaToHex(rgba)}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,245,0.68)' }}>
                  hexToRgba: [{rgba.map((value) => Number(value.toFixed(2))).join(', ')}]
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  ),
};
