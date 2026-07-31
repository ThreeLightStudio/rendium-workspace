import { describe, expect, it } from 'vitest';
import { compileRelativeCoords } from '../compiler/layoutCompiler';
import { validatePresetSchema } from '../validator/schemaValidator';

describe('Layout Compiler & Schema Validator', () => {
  // ---------------------------------------------------------------------------
  // 1. Schema Validator Tests
  // ---------------------------------------------------------------------------
  describe('validatePresetSchema', () => {
    it('should validate a valid partial manifest schema', () => {
      const validPreset = {
        version: '1.0',
        projectSettings: {
          canvas: {
            size: { width: 1280, height: 720 },
          },
        },
        layers: {
          'layer-1': {
            id: 'layer-1',
            kind: 'visual',
            startTime: 0,
            duration: 100,
          },
        },
        layerOrder: ['layer-1'],
      };

      expect(validatePresetSchema(validPreset)).toBe(true);
    });

    it('should reject schemas with invalid versions', () => {
      const invalidVersion = {
        version: '2.0', // only '1.0' or undefined is valid
      };
      expect(validatePresetSchema(invalidVersion)).toBe(false);
    });

    it('should reject non-object values', () => {
      expect(validatePresetSchema(null)).toBe(false);
      expect(validatePresetSchema('preset')).toBe(false);
      expect(validatePresetSchema(42)).toBe(false);
    });

    it('should reject invalid canvas sizes', () => {
      const invalidCanvas = {
        projectSettings: {
          canvas: {
            size: { width: '1920', height: 1080 }, // width must be number
          },
        },
      };
      expect(validatePresetSchema(invalidCanvas)).toBe(false);
    });

    it('should reject layers with invalid kinds', () => {
      const invalidLayer = {
        layers: {
          'layer-1': {
            id: 'layer-1',
            kind: 'invalid-kind-name', // kind must be 'visual' | 'audio' | 'control'
          },
        },
      };
      expect(validatePresetSchema(invalidLayer)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Relative Coordinates Compiler Tests
  // ---------------------------------------------------------------------------
  describe('compileRelativeCoords', () => {
    it('should translate fractional relative coordinates to absolute coordinates', () => {
      const relativePreset = {
        version: '1.0',
        projectSettings: {
          canvas: {
            size: { width: 1000, height: 1000 },
          },
        },
        layers: {
          'layer-test': {
            id: 'layer-test',
            kind: 'visual',
            startTime: 0,
            duration: 300,
            transform: {
              position: { x: 0.5, y: -0.25 },
              scale: { x: 0.8, y: 0.1 },
              rotation: 0,
            },
          },
        },
        layerOrder: ['layer-test'],
      };

      const compiled = compileRelativeCoords(relativePreset, { width: 1920, height: 1080 });

      expect(compiled.projectSettings.canvas.size).toEqual({ width: 1920, height: 1080 });
      const layer = compiled.layers['layer-test'];
      expect(layer?.transform?.position?.x).toBe(Math.round(0.5 * 1920)); // 960
      expect(layer?.transform?.position?.y).toBe(Math.round(-0.25 * 1080)); // -270
      expect(layer?.transform?.scale?.x).toBe(Math.round(0.8 * 1920)); // 1536
      expect(layer?.transform?.scale?.y).toBe(Math.round(0.1 * 1080)); // 108
    });

    it('should preserve absolute coordinates if they are outside [-1.0, 1.0] range', () => {
      const absolutePreset = {
        version: '1.0',
        projectSettings: {
          canvas: {
            size: { width: 1000, height: 1000 },
          },
        },
        layers: {
          'layer-abs': {
            id: 'layer-abs',
            kind: 'visual',
            startTime: 0,
            duration: 300,
            transform: {
              position: { x: 500, y: 600 },
              scale: { x: 1920, y: 1080 },
              rotation: 0,
            },
          },
        },
        layerOrder: ['layer-abs'],
      };

      const compiled = compileRelativeCoords(absolutePreset, { width: 800, height: 600 });
      const layer = compiled.layers['layer-abs'];
      expect(layer?.transform?.position?.x).toBe(500);
      expect(layer?.transform?.position?.y).toBe(600);
      expect(layer?.transform?.scale?.x).toBe(1920);
      expect(layer?.transform?.scale?.y).toBe(1080);
    });

    it('should fallback to classic visualizer template preset gracefully if validation fails', () => {
      const corruptPreset = {
        version: '9.9-corrupted',
        layers: 'corrupted-string-instead-of-object',
      };

      const compiled = compileRelativeCoords(corruptPreset, { width: 1280, height: 720 });

      // Check that it successfully yielded the classic visualizer preset instead of crashing
      expect(compiled.projectInfo.name).toBe('Classic Visualizer');
      expect(compiled.projectSettings.canvas.size).toEqual({ width: 1280, height: 720 });
      expect(compiled.layerOrder).toContain('layer-classic-spectrum');
      expect(compiled.layers['layer-classic-spectrum']).toBeDefined();
    });
  });
});
