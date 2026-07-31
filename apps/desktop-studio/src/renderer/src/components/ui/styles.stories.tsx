import type { Meta, StoryObj } from '@storybook/react';
import {
  chipClass,
  dialogShellClass,
  helperTextClass,
  localeSwitcherBadgeClass,
  localeSwitcherTriggerClass,
  modalCardClass,
  modalOverlayClass,
  primaryButtonClass,
  sectionLabelClass,
  segmentedButtonClass,
  segmentedControlClass,
  settingsButtonClass,
  surfaceCardClass,
  surfaceMutedClass,
  surfacePanelClass,
} from './styles';

const meta: Meta = {
  title: 'Foundations/Color/Palette',
};

export default meta;

type Story = StoryObj<typeof meta>;

const tokenItems = [
  { label: 'surfaceCardClass', className: surfaceCardClass },
  { label: 'surfacePanelClass', className: surfacePanelClass },
  { label: 'surfaceMutedClass', className: surfaceMutedClass },
  { label: 'modalCardClass', className: modalCardClass },
  { label: 'primaryButtonClass', className: primaryButtonClass({ tone: 'default' }) },
  { label: 'segmentedControlClass', className: segmentedControlClass },
  { label: 'segmentedButtonClass(active)', className: segmentedButtonClass({ active: true }) },
  { label: 'localeSwitcherTriggerClass', className: localeSwitcherTriggerClass({ open: true }) },
  {
    label: 'localeSwitcherBadgeClass(active)',
    className: localeSwitcherBadgeClass({ active: true }),
  },
  { label: 'chipClass(accent)', className: chipClass({ tone: 'accent' }) },
  { label: 'settingsButtonClass(active)', className: settingsButtonClass({ active: true }) },
];

export const Palette: Story = {
  render: () => (
    <div
      style={{
        padding: 24,
        minHeight: 420,
        background:
          'radial-gradient(circle at top, rgba(0, 212, 255, 0.12), transparent 35%), linear-gradient(180deg, #11131a 0%, #0b0d12 100%)',
        color: 'rgba(255,255,245,0.92)',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div className={sectionLabelClass} style={{ marginBottom: 12 }}>
        Foundations / Color Palette
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        {tokenItems.map((item) => (
          <div key={item.label} className={item.className} style={{ padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{item.label}</div>
            <div className={helperTextClass}>Token surface shown with representative content.</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 16, marginTop: 20 }}>
        <div className={dialogShellClass} style={{ gap: 12 }}>
          <div className={sectionLabelClass}>Modal Stack</div>
          <div
            className={modalOverlayClass as string}
            style={{ position: 'relative', minHeight: 180 }}
          >
            <div
              className={modalCardClass}
              style={{ padding: 20, maxWidth: 360, background: '#12141c' }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Modal Card</div>
              <div className={helperTextClass}>
                Backdrop, card, and shell tokens stay static here.
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <button type="button" className={primaryButtonClass({ tone: 'default' })}>
            Default
          </button>
          <button type="button" className={primaryButtonClass({ tone: 'accent' })}>
            Accent
          </button>
          <button type="button" className={chipClass({ tone: 'neutral' })}>
            Neutral Chip
          </button>
          <button type="button" className={chipClass({ tone: 'accent' })}>
            Accent Chip
          </button>
          <button
            type="button"
            className={settingsButtonClass({ active: true })}
            style={{ padding: '8px 12px' }}
          >
            Settings
          </button>
        </div>
      </div>
    </div>
  ),
};
