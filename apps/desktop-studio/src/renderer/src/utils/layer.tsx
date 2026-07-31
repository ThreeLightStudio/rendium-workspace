import type { ILayer, JsonValue, ScopeRoleType } from '@rendium/engine';
import {
  Activity,
  Box,
  Film,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Type,
  Volume2,
} from 'lucide-react';
import type React from 'react';
import { translate } from '../i18n/locale';
import {
  getManifestForLayer,
  getScopeRole,
  getSourceParam,
  getStudioLayerType,
} from './canonicalLayer';

const SCOPE_LABEL_KEYS: Record<ScopeRoleType, string> = {
  main: 'layer.sequenceMain',
  overlay: 'layer.sequenceOverlay',
  text: 'layer.sequenceText',
  composite: 'layer.sequence',
};

export function getScopeDisplayLabel(scopeRole?: ScopeRoleType): string {
  const labelKey = SCOPE_LABEL_KEYS[scopeRole ?? 'composite'] ?? 'layer.sequence';
  return translate(labelKey as Parameters<typeof translate>[0]);
}

export const LAYER_ICONS: Record<string, React.ElementType> = {
  spectrum: Activity,
  image: ImageIcon,
  video: Film,
  audio: Volume2,
  text: Type,
  'scope:start': FolderOpen,
  'scope:end': Folder,
};

/**
 * Returns a human-readable label for a layer.
 */
export function getLayerLabel(layer: ILayer): string {
  const layerType = getStudioLayerType(layer);

  if (layerType === 'scope:start') {
    return getScopeDisplayLabel(getScopeRole(layer));
  }

  if (layerType === 'scope:end') {
    return '';
  }

  if (layerType === 'text') {
    return getSourceParam<string>(getManifestForLayer(layer), 'text') || layer.id;
  }
  return layer.name || layer.id;
}

/**
 * Generates a deterministic HSL color from a string.
 */
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 60%)`;
}

/**
 * Resolves the color for a layer based on its configuration or ID.
 */
export function getLayerColor(layer: ILayer): string {
  const color = getSourceParam<JsonValue>(getManifestForLayer(layer), 'color');
  if (Array.isArray(color)) {
    const [r, g, b] = color;
    if (typeof r === 'number' && typeof g === 'number' && typeof b === 'number') {
      return `rgba(${r * 255}, ${g * 255}, ${b * 255}, 0.8)`;
    }
  }
  return stringToColor(layer.id);
}

/**
 * Returns the icon associated with a layer type as a React component.
 */
export function getLayerIcon(type: string, color?: string, size = 16): React.ReactNode {
  const IconComponent = LAYER_ICONS[type] || Box;
  return (
    <IconComponent
      color={color}
      size={size}
      strokeWidth={2}
      style={{ minWidth: size, minHeight: size }}
    />
  );
}
