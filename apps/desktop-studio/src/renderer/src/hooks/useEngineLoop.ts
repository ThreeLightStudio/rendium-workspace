import {
  AudioLayer,
  BACKGROUND_CONFIG,
  type MediaReadiness,
  engineStore,
  getAutomationValues,
} from '@rendium/engine';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { registerTimelineSeekHandler } from '../services/timelinePlaybackController';
import { TIMELINE_EXTENT_PADDING_SECONDS, useStudioStore } from '../stores/studioStore';
import { isAudioRuntimeLayer, isRenderableRuntimeLayer } from '../utils/runtimeLayerGuards';

type RgbaColor = [number, number, number, number];

function getCanvasBackgroundColor(): RgbaColor {
  return (
    engineStore.getManifest().projectSettings.canvas.backgroundColor ??
    BACKGROUND_CONFIG.DEFAULT_COLOR
  );
}

const TIMELINE_PLAYHEAD_HEADROOM_SECONDS = TIMELINE_EXTENT_PADDING_SECONDS * 3;

function maybeGrowTimelineExtentForPlayback(time: number): void {
  const { timelineExtent, ensureTimelineExtent } = useStudioStore.getState();
  if (time >= timelineExtent - TIMELINE_EXTENT_PADDING_SECONDS) {
    ensureTimelineExtent(time + TIMELINE_PLAYHEAD_HEADROOM_SECONDS);
  }
}

/**
 * Hook to manage the WebGPU rendering loop and playback state.
 * Connects the HTMLCanvasElement to the internal Engine Scene.
 */
export function useEngineLoop(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  options: { disabled?: boolean } = {},
) {
  const { disabled = false } = options;
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaReadiness, setMediaReadiness] = useState<MediaReadiness>('ready');

  const { duration, projectDuration, pxPerSec, width, height, undoStackSize, redoStackSize } =
    useSyncExternalStore(engineStore.subscribe, engineStore.getSnapshot);

  const canUndo = undoStackSize > 0;
  const canRedo = redoStackSize > 0;
  const isMediaReady = mediaReadiness === 'ready';
  const canPlay = !disabled && mediaReadiness !== 'loading';

  const undo = useCallback(() => engineStore.undo(), []);
  const redo = useCallback(() => engineStore.redo(), []);
  const setPxPerSec = useCallback((next: number) => engineStore.setPxPerSec(next), []);

  const rafIdRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  const mediaReadinessRef = useRef<MediaReadiness>('ready');
  const audioDataCacheRef = useRef<Float32Array>(new Float32Array(2048));

  // Ref-based state to keep the loop stable without useEffect re-runs
  const isPlayingRef = useRef<boolean>(false);

  const getNormalizedAudioData = useCallback((audioId: string): Float32Array => {
    const scene = engineStore._internalScene;
    if (!scene) return audioDataCacheRef.current;

    const layer = scene.getLayerById(audioId);
    if (!isAudioRuntimeLayer(layer)) return audioDataCacheRef.current;

    const freqData = layer.getFrequencyData?.(currentTimeRef.current);
    if (!freqData) return audioDataCacheRef.current;

    if (audioDataCacheRef.current.length !== freqData.length) {
      audioDataCacheRef.current = new Float32Array(freqData.length);
    }

    const normalized = audioDataCacheRef.current;

    // Evaluate active segment automation values
    const manifest = engineStore.getManifest();
    const automation = getAutomationValues(manifest.injectionSegments, currentTimeRef.current);
    const sensitivity = automation.spectrumSensitivity;

    for (let i = 0; i < freqData.length; i++) {
      normalized[i] = (freqData[i] / 255) * sensitivity;
    }

    return normalized;
  }, []);

  const seek = useCallback(
    (time: number) => {
      const normalizedTime = Number.isFinite(time) ? time : 0;
      const { timelineExtent } = useStudioStore.getState();
      const newTime = Math.max(0, Math.min(normalizedTime, timelineExtent));
      currentTimeRef.current = newTime;
      setCurrentTime(newTime);

      // Force an update to the engine if we are paused
      if (!isPlayingRef.current && !disabled) {
        const scene = engineStore._internalScene;
        if (scene) {
          scene.update(newTime, 0, getNormalizedAudioData);
        }
      }
    },
    [disabled, getNormalizedAudioData],
  );

  useEffect(() => registerTimelineSeekHandler(seek), [seek]);

  const togglePlay = useCallback(() => {
    if (!canPlay) {
      return;
    }

    void AudioLayer.resumeSharedContext().catch((err) => {
      console.error('[useEngineLoop] Failed to resume audio context:', err);
    });

    setIsPlaying((prev) => {
      const next = !prev;
      isPlayingRef.current = next;
      return next;
    });
  }, [canPlay]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || disabled) {
      setIsReady(false);
      return;
    }

    let device: GPUDevice | null = null;
    let context: GPUCanvasContext | null = null;
    let format: GPUTextureFormat = 'bgra8unorm';

    const initWebGPU = async () => {
      try {
        if (!navigator.gpu) throw new Error('WebGPU not supported');

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error('No GPU adapter found');

        device = await adapter.requestDevice();
        context = canvas.getContext('webgpu');
        if (!context) throw new Error('Failed to get WebGPU context');

        format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({
          device,
          format,
          alphaMode: 'premultiplied',
        });

        setIsReady(true);
      } catch (err) {
        console.error('WebGPU Initialization Error:', err);
      }
    };

    initWebGPU();

    const render = async (time: number) => {
      if (!device || !context || disabled) {
        rafIdRef.current = requestAnimationFrame(render);
        return;
      }

      // Performance delta
      const deltaTime = lastTimeRef.current === 0 ? 0 : (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      // Playback logic
      if (isPlayingRef.current) {
        currentTimeRef.current += deltaTime;
        maybeGrowTimelineExtentForPlayback(currentTimeRef.current);
        setCurrentTime(currentTimeRef.current);
      }

      const scene = engineStore._internalScene;
      if (!scene) {
        rafIdRef.current = requestAnimationFrame(render);
        return;
      }
      const viewportWidth = canvas.width || width;
      const viewportHeight = canvas.height || height;

      // 0. Ensure all layers are setup (WebGPU resource allocation)
      for (const layer of scene.layers) {
        if (!isRenderableRuntimeLayer(layer)) continue;
        if (!layer.isSetupFor(device)) {
          try {
            await layer.setup(device, format);
          } catch (err) {
            console.error(`Failed to setup layer ${layer.id}:`, err);
          }
        }
      }

      const nextMediaReadiness = scene.getActiveMediaLayersReadiness(currentTimeRef.current);
      if (mediaReadinessRef.current !== nextMediaReadiness) {
        mediaReadinessRef.current = nextMediaReadiness;
        setMediaReadiness(nextMediaReadiness);
      }
      if (nextMediaReadiness === 'loading' && isPlayingRef.current) {
        isPlayingRef.current = false;
        setIsPlaying(false);
      }

      // 1. Update Engine State
      scene.update(
        currentTimeRef.current,
        isPlayingRef.current ? deltaTime : 0,
        getNormalizedAudioData,
      );

      // 2. Prepare WebGPU Pass
      const commandEncoder = device.createCommandEncoder();
      const textureView = context.getCurrentTexture().createView();
      const [clearR, clearG, clearB, clearA] = getCanvasBackgroundColor();

      const renderPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [
          {
            view: textureView,
            clearValue: { r: clearR, g: clearG, b: clearB, a: clearA },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      };

      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

      // 3. Draw Scene with Camera Shake
      const manifest = engineStore.getManifest();
      const automation = getAutomationValues(manifest.injectionSegments, currentTimeRef.current);
      const shakeIntensity = automation.shakeIntensity;

      // Generate fast, natural pseudo-random shake displacement in NDC space
      const shakeX =
        shakeIntensity > 0 ? Math.sin(currentTimeRef.current * 55) * 0.04 * shakeIntensity : 0;
      const shakeY =
        shakeIntensity > 0 ? Math.cos(currentTimeRef.current * 73) * 0.04 * shakeIntensity : 0;

      scene.draw({
        device,
        format,
        passEncoder,
        currentTime: currentTimeRef.current,
        deltaTime: isPlayingRef.current ? deltaTime : 0,
        resolution: { width, height },
        viewportResolution: { width: viewportWidth, height: viewportHeight },
        sampleRate: AudioLayer.sharedSampleRate,
        shakeX,
        shakeY,
      });

      passEncoder.end();
      device.queue.submit([commandEncoder.finish()]);

      rafIdRef.current = requestAnimationFrame(render);
    };

    rafIdRef.current = requestAnimationFrame(render);

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (device) {
        // To recover from export, we should theoretically cleanup or reset layers if they track device
        // But we'll leave it to setup calls.
      }
    };
  }, [canvasRef, disabled, getNormalizedAudioData, width, height]);

  return {
    isReady,
    isPlaying,
    currentTime,
    duration,
    projectDuration,
    pxPerSec,
    width,
    height,
    mediaReadiness,
    isMediaReady,
    togglePlay,
    seek,
    canUndo,
    canRedo,
    canPlay,
    undo,
    redo,
    setPxPerSec,
  };
}
