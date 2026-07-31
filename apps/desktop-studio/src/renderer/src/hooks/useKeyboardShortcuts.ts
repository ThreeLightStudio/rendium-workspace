import { engineStore } from '@rendium/engine';
import { useEffect, useMemo } from 'react';
import { useStudioStore } from '../stores/studioStore';
import { packStrands } from '../utils/packStrands';
import {
  buildDeleteSelectionIntents,
  buildDuplicateSelectionBatch,
} from '../utils/selectionActions';
import {
  TIMELINE_FRAME_STEP_SECONDS,
  type TimelineEditAction,
  buildSplitTimelineLayerIntents,
  buildTrimTimelineLayerEndIntents,
  buildTrimTimelineLayerStartIntents,
  clampTimelineSeekTime,
  findTimelineLayerAtTrackOffset,
  getActiveTimelineEditLayer,
  getTimelineEditTargetLayer,
} from '../utils/timelineEditCommands';
import { useLayerTree } from './useLayerTree';

interface KeyboardActions {
  isPlaying: boolean;
  currentTime: number;
  canPlay: boolean;
  togglePlay: () => void;
  seek: (time: number) => void;
  onSave?: () => void;
}

const TRANSPORT_STEP_SECONDS = 10;

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }

  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
}

function isMacPlatform(): boolean {
  return navigator.platform.toUpperCase().includes('MAC');
}

function deleteSelectedLayers(): void {
  const studioState = useStudioStore.getState();
  const intents = buildDeleteSelectionIntents(
    studioState.selectedLayerIds,
    engineStore.getManifest(),
  );

  if (intents.length === 0) {
    return;
  }

  engineStore.executeAtomicIntentBatch(intents);
  studioState.clearSelection();
}

function duplicateSelectedLayers(): void {
  const studioState = useStudioStore.getState();
  const { intents, createdLayerIds } = buildDuplicateSelectionBatch(
    studioState.selectedLayerIds,
    engineStore.getManifest(),
  );

  if (intents.length === 0) {
    return;
  }

  engineStore.executeAtomicIntentBatch(intents);
  studioState.selectLayers(createdLayerIds);
}

function getTimelineShortcutAction(e: KeyboardEvent, modKey: boolean): TimelineEditAction | null {
  if (modKey) return null;

  if (e.altKey && !e.shiftKey) {
    if (e.key === 'ArrowUp') return 'select-above';
    if (e.key === 'ArrowDown') return 'select-below';
  }

  if (e.altKey || e.ctrlKey || e.metaKey) return null;

  if (!e.shiftKey && e.key.toLowerCase() === 's') return 'split';

  if (e.code === 'BracketLeft') {
    return e.shiftKey ? 'jump-start' : 'trim-start';
  }

  if (e.code === 'BracketRight') {
    return e.shiftKey ? 'jump-end' : 'trim-end';
  }

  if (e.code === 'Comma') {
    return e.shiftKey ? 'step-back-second' : 'step-back-frame';
  }

  if (e.code === 'Period') {
    return e.shiftKey ? 'step-forward-second' : 'step-forward-frame';
  }

  return null;
}

function executeTimelineEditShortcut(
  action: TimelineEditAction,
  currentTime: number,
  seek: (time: number) => void,
  packedLayers: ReturnType<typeof packStrands>,
): boolean {
  const studioState = useStudioStore.getState();
  const manifest = engineStore.getManifest();
  const activeLayer = getActiveTimelineEditLayer(
    studioState.selectedLayerId,
    packedLayers,
    currentTime,
  );
  const editTargetLayer = getTimelineEditTargetLayer(
    studioState.selectedLayerId,
    packedLayers,
    currentTime,
  );

  if (!editTargetLayer) return false;

  if (action === 'select-above' || action === 'select-below') {
    const targetLayer = findTimelineLayerAtTrackOffset(
      packedLayers,
      editTargetLayer.id,
      currentTime,
      action === 'select-above' ? -1 : 1,
    );

    if (!targetLayer) return false;
    studioState.selectLayer(targetLayer.id);
    return true;
  }

  if (action === 'step-back-frame') {
    seek(clampTimelineSeekTime(currentTime - TIMELINE_FRAME_STEP_SECONDS));
    return true;
  }

  if (action === 'step-forward-frame') {
    seek(clampTimelineSeekTime(currentTime + TIMELINE_FRAME_STEP_SECONDS));
    return true;
  }

  if (action === 'step-back-second') {
    seek(clampTimelineSeekTime(currentTime - 1));
    return true;
  }

  if (action === 'step-forward-second') {
    seek(clampTimelineSeekTime(currentTime + 1));
    return true;
  }

  if (action === 'jump-start') {
    seek(clampTimelineSeekTime(editTargetLayer.startTime));
    return true;
  }

  if (action === 'jump-end') {
    seek(clampTimelineSeekTime(editTargetLayer.startTime + editTargetLayer.duration));
    return true;
  }

  if (action === 'split') {
    if (!activeLayer) return false;
    const result = buildSplitTimelineLayerIntents(manifest, activeLayer, currentTime);
    if (!result) return false;

    engineStore.executeAtomicIntentBatch(result.intents);
    studioState.selectLayer(result.createdLayerId);
    return true;
  }

  const intents =
    activeLayer && action === 'trim-start'
      ? buildTrimTimelineLayerStartIntents(manifest, activeLayer, currentTime)
      : activeLayer
        ? buildTrimTimelineLayerEndIntents(manifest, activeLayer, currentTime)
        : [];

  if (intents.length === 0) return false;
  engineStore.executeAtomicIntentBatch(intents);
  return true;
}

/**
 * Hook to handle global keyboard shortcuts for the studio.
 *
 * Shortcuts:
 *  Space              — Play / Pause (with hover-seek support)
 *  ArrowLeft/Right    — Transport by 10 seconds
 *  Home               — Jump to start
 *  Cmd+Z / Ctrl+Z     — Undo last manifest mutation
 *  Cmd+Shift+Z        — Redo previously undone mutation
 *  Ctrl+Y             — Redo (Windows convention alias)
 */
export function useKeyboardShortcuts({
  isPlaying,
  currentTime,
  canPlay,
  togglePlay,
  seek,
  onSave,
}: KeyboardActions) {
  const hoverTime = useStudioStore((s) => s.hoverTime);
  const { visibleLayers } = useLayerTree();
  const packedLayers = useMemo(() => packStrands(visibleLayers), [visibleLayers]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if the user is typing in an input or textarea.
      if (isEditableTarget(e.target)) {
        return;
      }

      const modKey = isMacPlatform() ? e.metaKey : e.ctrlKey;

      // ── Undo: Cmd+Z (Mac) / Ctrl+Z (Win/Linux) ──────────────────────
      if (modKey && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        engineStore.undo();
        return;
      }

      // ── Redo: Cmd+Shift+Z (Mac) / Ctrl+Shift+Z / Ctrl+Y (Win/Linux) ─
      if ((modKey && e.shiftKey && e.key === 'z') || (e.ctrlKey && !e.shiftKey && e.key === 'y')) {
        e.preventDefault();
        engineStore.redo();
        return;
      }

      // ── Delete: Backspace / Delete ───────────────────────────────────
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        deleteSelectedLayers();
        return;
      }

      // ── Duplicate: Cmd/Ctrl + D ──────────────────────────────────────
      if (modKey && !e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelectedLayers();
        return;
      }

      // ── Save: Cmd/Ctrl + S ───────────────────────────────────────────
      if (modKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onSave?.();
        return;
      }

      const timelineAction = getTimelineShortcutAction(e, modKey);
      if (timelineAction) {
        e.preventDefault();
        executeTimelineEditShortcut(timelineAction, currentTime, seek, packedLayers);
        return;
      }

      // ── Escape: Clear selection ──────────────────────────────────────
      if (e.key === 'Escape') {
        e.preventDefault();
        useStudioStore.getState().clearSelection();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();

        if (!canPlay) {
          return;
        }

        if (hoverTime !== null) {
          seek(hoverTime);
          if (!isPlaying) {
            togglePlay();
          }
          return;
        }

        togglePlay();
        return;
      }

      if (!canPlay) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seek(currentTime - TRANSPORT_STEP_SECONDS);
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        seek(currentTime + TRANSPORT_STEP_SECONDS);
        return;
      }

      if (e.key === 'Home') {
        e.preventDefault();
        seek(0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canPlay, currentTime, hoverTime, isPlaying, packedLayers, seek, togglePlay, onSave]);
}
