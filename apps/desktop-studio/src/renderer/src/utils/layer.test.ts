import { type ILayer, engineStore } from '@rendium/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { getLocale, setLocale } from '../i18n/locale';
import { getLayerLabel } from './layer';

const initialLocale = getLocale();

afterEach(() => {
  setLocale(initialLocale);
});

describe('layer label helpers', () => {
  it('renders scope labels from scopeRole instead of the stored layer name', () => {
    engineStore.loadManifest({
      version: '1.0',
      projectInfo: { name: 'Layer Test', createdAt: 0, updatedAt: 0 },
      projectSettings: { canvas: { size: { width: 1920, height: 1080 } } },
      layers: {
        'scope-main': {
          id: 'scope-main',
          kind: 'control',
          name: 'Completely Different Name',
          startTime: 0,
          duration: 1,
          control: {
            role: 'scopeStart',
            params: {
              scopeRole: 'main',
            },
          },
        },
      },
      layerOrder: ['scope-main'],
      links: {},
    });
    const scopeLayer = {
      id: 'scope-main',
      name: 'Completely Different Name',
      getConfig: () => ({}),
    } as unknown as ILayer;

    setLocale('ko');
    expect(getLayerLabel(scopeLayer)).toBe('메인 미디어');

    setLocale('en');
    expect(getLayerLabel(scopeLayer)).toBe('Main media');
  });
});
