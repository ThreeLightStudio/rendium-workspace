import { engineStore } from '@rendium/engine';
import { useEngineManifest } from '../../hooks/useEngineManifest';
import { useLocale } from '../../i18n/locale';
import { hexToRgba, rgbaToHex } from './color';
import { InspectorColorInput, InspectorField, InspectorSection, InspectorValue } from './ui';

type RgbaColor = [number, number, number, number];

const DEFAULT_BACKGROUND_COLOR: RgbaColor = [0.05, 0.05, 0.07, 1];

export function BackgroundControlPanel() {
  const { t } = useLocale();
  const manifest = useEngineManifest();
  const backgroundColor =
    manifest.projectSettings.canvas.backgroundColor ?? DEFAULT_BACKGROUND_COLOR;

  return (
    <InspectorSection title={t('inspector.canvasBackgroundSection')}>
      <InspectorField
        label={t('inspector.canvasBackground')}
        value={<InspectorValue>{rgbaToHex(backgroundColor).toUpperCase()}</InspectorValue>}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <InspectorColorInput
            id="canvas-background-color"
            value={rgbaToHex(backgroundColor)}
            onChange={(e) => {
              engineStore.dispatchIntent({
                type: 'UPDATE_CANVAS_BACKGROUND_COLOR',
                color: hexToRgba(e.target.value),
              });
            }}
          />
          <span style={{ fontSize: '11px', color: '#666' }}>
            {t('inspector.canvasBackgroundUpdated')}
          </span>
        </div>
      </InspectorField>
    </InspectorSection>
  );
}
