import type { LayerConfig } from '@rendium/engine';
import { css } from '@styled-system/css';
import { useLocale } from '../../i18n/locale';
import { hexToRgba, rgbaToHex } from './color';
import {
  InspectorColorInput,
  InspectorField,
  InspectorRangeInput,
  InspectorSection,
  InspectorTextArea,
  InspectorToggleGroup,
  InspectorValue,
} from './ui';

interface TextControlPanelProps {
  layer: TextControlValue;
  onUpdate: (config: Partial<LayerConfig>) => void;
}

export interface TextControlValue {
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: string | number;
  color: [number, number, number, number];
  align: 'left' | 'center' | 'right';
  outlineColor: [number, number, number, number];
  outlineWidth: number;
  anchor: { x: number; y: number };
}

export function TextControlPanel({ layer, onUpdate }: TextControlPanelProps) {
  const { t } = useLocale();
  return (
    <div className={css({ display: 'flex', flexDirection: 'column', gap: '4' })}>
      <InspectorField label={t('inspector.textContent')}>
        <InspectorTextArea
          id="text-content"
          value={layer.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
        />
      </InspectorField>

      <InspectorField
        label={t('inspector.fontSize')}
        value={<InspectorValue>{layer.fontSize}px</InspectorValue>}
      >
        <InspectorRangeInput
          id="text-font-size"
          min="8"
          max="200"
          step="1"
          value={layer.fontSize}
          onChange={(e) => onUpdate({ fontSize: Number.parseInt(e.target.value, 10) })}
        />
      </InspectorField>

      <InspectorField
        label={t('inspector.textColor')}
        value={<InspectorValue>{rgbaToHex(layer.color).toUpperCase()}</InspectorValue>}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <InspectorColorInput
            id="text-color"
            value={rgbaToHex(layer.color)}
            onChange={(e) => onUpdate({ color: hexToRgba(e.target.value) })}
          />
          <span style={{ fontSize: '11px', color: '#666' }}>
            {t('inspector.immediateCanvasPreview')}
          </span>
        </div>
      </InspectorField>

      <InspectorField label={t('inspector.alignment')}>
        <InspectorToggleGroup
          value={layer.align}
          onChange={(align) => onUpdate({ align })}
          options={[
            { value: 'left', label: t('inspector.left') },
            { value: 'center', label: t('inspector.center') },
            { value: 'right', label: t('inspector.right') },
          ]}
        />
      </InspectorField>

      <InspectorSection title={t('inspector.outlineSettings')}>
        <InspectorField
          label={t('inspector.outlineWidth')}
          value={<InspectorValue>{layer.outlineWidth}px</InspectorValue>}
        >
          <InspectorRangeInput
            id="text-outline-width"
            min="0"
            max="50"
            step="1"
            value={layer.outlineWidth}
            onChange={(e) => onUpdate({ outlineWidth: Number.parseInt(e.target.value, 10) })}
          />
        </InspectorField>

        <InspectorField
          label={t('inspector.outlineColor')}
          value={<InspectorValue>{rgbaToHex(layer.outlineColor).toUpperCase()}</InspectorValue>}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <InspectorColorInput
              id="text-outline-color"
              value={rgbaToHex(layer.outlineColor)}
              onChange={(e) => onUpdate({ outlineColor: hexToRgba(e.target.value) })}
            />
            <span style={{ fontSize: '11px', color: '#666' }}>{t('inspector.keepsReadable')}</span>
          </div>
        </InspectorField>
      </InspectorSection>
    </div>
  );
}
