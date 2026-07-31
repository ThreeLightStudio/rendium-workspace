import type { IRenderableLayer, LayerConfig } from '@rendium/engine';
import { css } from '@styled-system/css';
import { useLocale } from '../../i18n/locale';
import { InspectorField, InspectorNumberInput, InspectorRangeInput, InspectorValue } from './ui';

interface TransformControlPanelProps {
  layer: IRenderableLayer;
  onUpdate: (config: Partial<LayerConfig>) => void;
  onTransient?: (config: Partial<LayerConfig>) => void;
  onCommit?: () => void;
}

export function TransformControlPanel({
  layer,
  onUpdate,
  onTransient,
  onCommit,
}: TransformControlPanelProps) {
  const { t } = useLocale();
  const handleChange = onTransient ?? onUpdate;
  const handleMouseUp = onCommit;
  const position = normalizePoint(layer.position, { x: 0, y: 0 });
  const scale = normalizePoint(layer.scale, { x: 1, y: 1 });
  const rotation = normalizeNumber(layer.rotation, 0);

  return (
    <div className={css({ display: 'flex', flexDirection: 'column', gap: '4' })}>
      <InspectorField
        label={t('inspector.positionX')}
        value={<InspectorValue>{Math.round(position.x)}</InspectorValue>}
      >
        <div className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
          <InspectorNumberInput
            density="compact"
            value={Math.round(position.x)}
            onChange={(e) =>
              onUpdate({
                position: {
                  ...position,
                  x: Number.parseInt(e.target.value, 10) || 0,
                },
              })
            }
          />
        </div>
        <InspectorRangeInput
          id="pos-x"
          min="-2000"
          max="2000"
          step="1"
          value={position.x}
          onChange={(e) =>
            handleChange({
              position: {
                ...position,
                x: Number.parseFloat(e.target.value),
              },
            })
          }
          onMouseUp={handleMouseUp}
        />
      </InspectorField>

      <InspectorField
        label={t('inspector.positionY')}
        value={<InspectorValue>{Math.round(position.y)}</InspectorValue>}
      >
        <div className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
          <InspectorNumberInput
            density="compact"
            value={Math.round(position.y)}
            onChange={(e) =>
              onUpdate({
                position: {
                  ...position,
                  y: Number.parseInt(e.target.value, 10) || 0,
                },
              })
            }
          />
        </div>
        <InspectorRangeInput
          id="pos-y"
          min="-2000"
          max="2000"
          step="1"
          value={position.y}
          onChange={(e) =>
            handleChange({
              position: {
                ...position,
                y: Number.parseFloat(e.target.value),
              },
            })
          }
          onMouseUp={handleMouseUp}
        />
      </InspectorField>

      <div className={css({ display: 'flex', gap: '3' })}>
        <InspectorField
          label={t('inspector.scaleX')}
          value={<InspectorValue>{scale.x.toFixed(2)}</InspectorValue>}
          className={css({ flex: 1 })}
        >
          <InspectorRangeInput
            id="scale-x"
            min="0.01"
            max="5"
            step="0.01"
            value={scale.x}
            onChange={(e) =>
              handleChange({
                scale: { ...scale, x: Number.parseFloat(e.target.value) },
              })
            }
            onMouseUp={handleMouseUp}
          />
        </InspectorField>
        <InspectorField
          label={t('inspector.scaleY')}
          value={<InspectorValue>{scale.y.toFixed(2)}</InspectorValue>}
          className={css({ flex: 1 })}
        >
          <InspectorRangeInput
            id="scale-y"
            min="0.01"
            max="5"
            step="0.01"
            value={scale.y}
            onChange={(e) =>
              handleChange({
                scale: { ...scale, y: Number.parseFloat(e.target.value) },
              })
            }
            onMouseUp={handleMouseUp}
          />
        </InspectorField>
      </div>

      <InspectorField
        label={t('inspector.rotation')}
        value={<InspectorValue>{((rotation * 180) / Math.PI).toFixed(0)}°</InspectorValue>}
      >
        <InspectorRangeInput
          id="rotation"
          min={-Math.PI}
          max={Math.PI}
          step={Math.PI / 180}
          value={rotation}
          onChange={(e) => handleChange({ rotation: Number.parseFloat(e.target.value) })}
          onMouseUp={handleMouseUp}
        />
      </InspectorField>
    </div>
  );
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizePoint(
  value: unknown,
  fallback: { x: number; y: number },
): { x: number; y: number } {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const point = value as { x?: unknown; y?: unknown };
  return {
    x: normalizeNumber(point.x, fallback.x),
    y: normalizeNumber(point.y, fallback.y),
  };
}
