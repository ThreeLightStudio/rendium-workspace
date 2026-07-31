import { engineStore } from '@rendium/engine';
import type { IProjectManifest } from '@rendium/engine';
import { create } from 'zustand';
import {
  type UserPreset,
  deleteUserPreset,
  getUserPresets,
  saveUserPreset,
} from '../utils/userPresetsDb';

interface PresetState {
  userPresets: UserPreset[];
  isCapturing: boolean;
  isLoading: boolean;
  loadPresets: () => Promise<void>;
  captureCurrentPreset: (name: string, canvas: HTMLCanvasElement | null) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;
}

export const usePresetStore = create<PresetState>((set, get) => ({
  userPresets: [],
  isCapturing: false,
  isLoading: false,

  loadPresets: async () => {
    set({ isLoading: true });
    try {
      const presets = await getUserPresets();
      set({ userPresets: presets });
    } catch (err) {
      console.error('Failed to load user presets from DB:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  captureCurrentPreset: async (name: string, canvas: HTMLCanvasElement | null) => {
    set({ isCapturing: true });
    try {
      const manifest = engineStore.getManifest();

      // 1. Generate 64x64 base64 PNG thumbnail from canvas
      let thumbnail = '';
      if (canvas) {
        try {
          const resizeCanvas = document.createElement('canvas');
          resizeCanvas.width = 64;
          resizeCanvas.height = 64;
          const ctx = resizeCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(canvas, 0, 0, 64, 64);
            thumbnail = resizeCanvas.toDataURL('image/png');
          }
        } catch (canvasErr) {
          console.warn('Could not generate canvas thumbnail:', canvasErr);
        }
      }

      // 2. Perform Reverse Recipe Parsing (sanitize layers, identify slots)
      const clonedLayers = structuredClone(manifest.layers);
      const clonedOrder = [...manifest.layerOrder];
      const slots: ('audio' | 'background')[] = [];

      // Identify audio layers and strip them from design structure
      let hasAudio = false;
      for (const key of Object.keys(clonedLayers)) {
        const layer = clonedLayers[key];
        if (layer.kind === 'audio') {
          hasAudio = true;
          delete clonedLayers[key];
          const idx = clonedOrder.indexOf(key);
          if (idx !== -1) {
            clonedOrder.splice(idx, 1);
          }
        }
      }
      if (hasAudio) {
        slots.push('audio');
      }

      // Sanitize background image (raster) and visual spectrum layers
      for (const key of Object.keys(clonedLayers)) {
        const layer = clonedLayers[key];
        if (layer.kind === 'visual' && layer.source?.provider === 'raster') {
          if (!slots.includes('background')) {
            slots.push('background');
          }
          // Strip local binary references
          if (layer.source.params) {
            layer.source.params.sourceUrl = null;
          }
          layer.source.sourceId = 'placeholder:background';
        }

        // Dissociate spectrum layers from any hardcoded audio ID
        if (layer.kind === 'visual' && layer.source?.provider === 'generated-visual') {
          if (layer.source.params) {
            layer.source.params.linkedAudioId = null;
          }
        }
      }

      const presetManifest: Partial<IProjectManifest> = {
        version: manifest.version,
        projectSettings: {
          canvas: {
            size: manifest.projectSettings.canvas.size,
            backgroundColor: manifest.projectSettings.canvas.backgroundColor,
          },
        },
        layers: clonedLayers,
        layerOrder: clonedOrder,
      };

      const preset: UserPreset = {
        id: crypto.randomUUID(),
        name: name.trim() || 'Custom Preset',
        thumbnail,
        slots,
        manifest: presetManifest,
        createdAt: Date.now(),
      };

      // 3. Commit to IndexedDB
      await saveUserPreset(preset);

      // 4. Reload local presets list
      await get().loadPresets();
    } catch (err) {
      console.error('Failed to capture current preset:', err);
      throw err;
    } finally {
      set({ isCapturing: false });
    }
  },

  deletePreset: async (id: string) => {
    try {
      await deleteUserPreset(id);
      await get().loadPresets();
    } catch (err) {
      console.error('Failed to delete preset:', err);
      throw err;
    }
  },
}));
