import { type ILayer, engineStore } from '@rendium/engine';
import {
  ArrowDown,
  ArrowUp,
  List,
  Lock,
  Scissors,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  X,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useEngineStore } from '../../hooks/useEngineStore';
import { useLayerTree } from '../../hooks/useLayerTree';
import { useLocale } from '../../i18n/locale';
import { TIMELINE_EXTENT_PADDING_SECONDS, useStudioStore } from '../../stores/studioStore';
import { getStudioLayerType } from '../../utils/canonicalLayer';
import {
  getLinkedVideoAudioLayerId,
  resolveLinkedVideoAudioPair,
} from '../../utils/linkedVideoAudio';
import { getLayerColor, getLayerIcon, getLayerLabel } from '../../utils/layer';
import { type IPackedLayer, packStrands } from '../../utils/packStrands';
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
} from '../../utils/timelineEditCommands';
import { getPlaybackFollowScrollLeft, getTimelineMinPxPerSec } from '../../utils/timelineViewport';
import { ScaleControlBar } from '../ui/ScaleControlBar';
import { TimeRulerCanvas } from './TimeRulerCanvas';

const ZOOM_STEP = 1.1;
const MAX_PX_PER_SEC = 200;
const DEFAULT_PX_PER_SEC = 20;
const MANUAL_SCROLL_SUPPRESSION_MS = 200;
const LAYER_DRAG_COMMIT_THRESHOLD_SECONDS = 0.01;
const TRACK_HEIGHT_PX = 12;
const TRACK_TOP_PADDING_PX = 8;
const TRACK_RULER_OFFSET_PX = 40;

const TIMELINE_SHORTCUT_ROWS = [
  { labelKey: 'timeline.edit.split', shortcut: 'S' },
  { labelKey: 'timeline.edit.trimStart', shortcut: '[' },
  { labelKey: 'timeline.edit.trimEnd', shortcut: ']' },
  { labelKey: 'timeline.edit.selectAbove', shortcut: 'Alt+↑' },
  { labelKey: 'timeline.edit.selectBelow', shortcut: 'Alt+↓' },
  { labelKey: 'timeline.edit.stepBackFrame', shortcut: ',' },
  { labelKey: 'timeline.edit.stepForwardFrame', shortcut: '.' },
  { labelKey: 'timeline.edit.stepBackSecond', shortcut: 'Shift+,' },
  { labelKey: 'timeline.edit.stepForwardSecond', shortcut: 'Shift+.' },
  { labelKey: 'timeline.edit.jumpStart', shortcut: 'Shift+[' },
  { labelKey: 'timeline.edit.jumpEnd', shortcut: 'Shift+]' },
  { labelKey: 'timeline.shortcut.playPause', shortcut: 'Space' },
  { labelKey: 'timeline.shortcut.zoom', shortcut: '⌘/Ctrl +/−/0' },
] as const;

const timelineToolButtonBaseStyle: React.CSSProperties = {
  width: '28px',
  height: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '6px',
  border: '1px solid rgba(255,255,255,0.16)',
  backgroundColor: 'rgba(255,255,255,0.055)',
  color: '#d6d6d6',
  padding: 0,
  cursor: 'pointer',
  flex: '0 0 28px',
};

function getTimelineToolButtonStyle(disabled: boolean): React.CSSProperties {
  if (!disabled) return timelineToolButtonBaseStyle;

  return {
    ...timelineToolButtonBaseStyle,
    opacity: 0.35,
    cursor: 'not-allowed',
  };
}

function preventDefaultWhenCancelable(e: React.SyntheticEvent): void {
  if (e.cancelable) {
    e.preventDefault();
  }
}

interface PackedStrandScrubberProps {
  currentTime: number;
  isPlaying: boolean;
  timelineExtent: number;
  contentDuration: number;
  pxPerSec: number;
  seek: (time: number) => void;
  onSelectLayer: (id: string | null) => void;
  selectedLayerId: string | null;
}

/**
 * PackedStrandScrubber (Refactored per Detailed Spec)
 * - DOM: Event Delegation to ScrubberContainer.
 * - State: hoverTime, clickTime, isModalOpen, modalPosition.
 * - Branching Case A/B/C logic for clicks.
 */
export const PackedStrandScrubber: React.FC<PackedStrandScrubberProps> = ({
  currentTime,
  isPlaying,
  timelineExtent,
  contentDuration,
  pxPerSec,
  seek,
  onSelectLayer,
  selectedLayerId,
}) => {
  const { t } = useLocale();
  const { setPxPerSec, dispatchIntent, dispatchTransient } = useEngineStore();
  const { visibleLayers } = useLayerTree();
  const setHighlightedLayers = useStudioStore((s) => s.setHighlightedLayers);
  const hoveredLayerId = useStudioStore((s) => s.hoveredLayerId);
  const setHoveredLayer = useStudioStore((s) => s.setHoveredLayer);
  const setGlobalHoverTime = useStudioStore((s) => s.setHoverTime);
  const ensureTimelineExtent = useStudioStore((s) => s.ensureTimelineExtent);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Constants for Overplotting Handling
  const MAX_TRACKS = 8;
  const CLUSTERING_THRESHOLD = 10;

  // 2. State Machine Management
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [clickTime, setClickTime] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDraggingLayer, setIsDraggingLayer] = useState(false);
  const [isShortcutTableOpen, setIsShortcutTableOpen] = useState(false);
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });

  const tooltipRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDialogElement>(null);
  const [hoveredStrandId, setHoveredStrandId] = useState<string | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    offset: number;
    initialStartTime: number;
    layers: Array<{
      layerId: string;
      initialStartTime: number;
      duration: number;
    }>;
    moved: boolean;
  } | null>(null);
  const suppressNextTimelineClickRef = useRef(false);
  const [adjustedTooltipPos, setAdjustedTooltipPos] = useState({
    x: -1000,
    y: -1000,
  });
  const [adjustedModalPos, setAdjustedModalPos] = useState({
    x: -1000,
    y: -1000,
  });
  const isEmptyProject = contentDuration <= 0;
  const [viewportWidth, setViewportWidth] = useState(0);
  const autoScrollRef = useRef(false);
  const lastManualScrollAtRef = useRef(0);
  const lastObservedCurrentTimeRef = useRef(currentTime);

  // 1. Calculate the packed layout for rendering (only content layers)
  const packedLayers = useMemo(() => packStrands(visibleLayers), [visibleLayers]);
  const activeEditLayer = useMemo(
    () => getActiveTimelineEditLayer(selectedLayerId, packedLayers, currentTime),
    [currentTime, packedLayers, selectedLayerId],
  );
  const targetEditLayer = useMemo(
    () => getTimelineEditTargetLayer(selectedLayerId, packedLayers, currentTime),
    [currentTime, packedLayers, selectedLayerId],
  );

  const totalTracks = useMemo(() => {
    return packedLayers.length > 0 ? Math.max(...packedLayers.map((l) => l.trackIndex)) + 1 : 0;
  }, [packedLayers]);

  const [trackOffset, setTrackOffset] = useState(0);

  const viewableTracks = useMemo(() => {
    return Math.min(totalTracks, MAX_TRACKS);
  }, [totalTracks]);

  // Calculate Overflow Intervals for Culling (Top and Bottom)
  const getOverflowIntervals = useCallback(
    (predicate: (l: IPackedLayer) => boolean) => {
      const culled = packedLayers.filter(predicate);
      if (culled.length === 0) return [];

      const sorted = [...culled].sort((a, b) => a.startTime - b.startTime);
      const merged: {
        start: number;
        end: number;
        count: number;
        ids: Set<string>;
      }[] = [];

      for (const layer of sorted) {
        const last = merged[merged.length - 1];
        const layerEnd = layer.startTime + layer.duration;

        if (last && layer.startTime <= last.end) {
          last.end = Math.max(last.end, layerEnd);
          last.ids.add(layer.id);
          last.count = last.ids.size;
        } else {
          merged.push({
            start: layer.startTime,
            end: layerEnd,
            count: 1,
            ids: new Set([layer.id]),
          });
        }
      }
      return merged;
    },
    [packedLayers],
  );

  const topOverflowIntervals = useMemo(
    () => getOverflowIntervals((l) => l.trackIndex < trackOffset),
    [getOverflowIntervals, trackOffset],
  );

  const bottomOverflowIntervals = useMemo(
    () => getOverflowIntervals((l) => l.trackIndex >= trackOffset + MAX_TRACKS),
    [getOverflowIntervals, trackOffset],
  );

  const timelineWidth = Math.max(1, timelineExtent * pxPerSec);
  const minTimelinePxPerSec = getTimelineMinPxPerSec(viewportWidth);

  useLayoutEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      return;
    }

    const updateViewportWidth = () => {
      setViewportWidth(scrollContainer.clientWidth);
    };

    updateViewportWidth();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateViewportWidth) : null;
    resizeObserver?.observe(scrollContainer);
    window.addEventListener('resize', updateViewportWidth);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateViewportWidth);
    };
  }, []);

  /**
   * Helper: Convert X coordinate to Engine time T.
   * t = (x / pxPerSec), x = clientX - rect.left (scroll-aware with inner timeline rect)
   */
  const calculateTimeToX = (clientX: number) => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(timelineWidth, clientX - rect.left));
    const t = x / pxPerSec;
    return Math.max(0, Math.min(timelineExtent, t));
  };

  const calculateUnboundedTimeToX = useCallback(
    (clientX: number) => {
      if (!timelineRef.current) return 0;
      const rect = timelineRef.current.getBoundingClientRect();
      const scrollLeft = scrollContainerRef.current?.scrollLeft ?? 0;
      const x = clientX - rect.left + scrollLeft;
      return Math.max(0, x / pxPerSec);
    },
    [pxPerSec],
  );

  const ensureLayerStartTimeExtent = useCallback(
    (layerUpdates: Array<{ startTime: number; duration: number }>) => {
      const latestEndTime = Math.max(
        0,
        ...layerUpdates.map(({ startTime, duration }) => startTime + duration),
      );
      ensureTimelineExtent(latestEndTime + TIMELINE_EXTENT_PADDING_SECONDS);
    },
    [ensureTimelineExtent],
  );

  const commitLayerStartTimes = useCallback(
    (layerUpdates: Array<{ layerId: string; startTime: number; duration: number }>) => {
      ensureLayerStartTimeExtent(layerUpdates);
      setHighlightedLayers([]);
      if (layerUpdates.length === 1) {
        const layerUpdate = layerUpdates[0];
        if (!layerUpdate) return;
        dispatchIntent({
          type: 'CHANGE_START_TIME',
          layerId: layerUpdate.layerId,
          startTime: layerUpdate.startTime,
        });
        return;
      }

      engineStore.executeAtomicIntentBatch(
        layerUpdates.map(({ layerId, startTime }) => ({
          type: 'CHANGE_START_TIME' as const,
          layerId,
          startTime,
        })),
      );
    },
    [dispatchIntent, ensureLayerStartTimeExtent, setHighlightedLayers],
  );

  const updateLayerStartTimes = useCallback(
    (layerUpdates: Array<{ layerId: string; startTime: number; duration: number }>) => {
      ensureLayerStartTimeExtent(layerUpdates);
      for (const { layerId, startTime } of layerUpdates) {
        dispatchTransient({
          type: 'TRANSIENT_LAYER_UPDATE',
          layerId,
          partial: { startTime },
        });
      }
    },
    [dispatchTransient, ensureLayerStartTimeExtent],
  );

  const beginLayerDrag = useCallback(
    (layer: IPackedLayer, e: React.PointerEvent<HTMLDivElement>) => {
      const layerType = getStudioLayerType(layer);
      const isDraggable =
        !layer.isProjectAnchor &&
        layerType !== 'scope:start' &&
        layerType !== 'scope:end' &&
        !layer.isInfinite;
      if (!isDraggable) return;

      e.preventDefault();
      e.stopPropagation();

      setIsDraggingLayer(true);
      const pointerTime = calculateUnboundedTimeToX(e.clientX);
      const linkedLayerId = getLinkedVideoAudioLayerId(engineStore.getManifest(), layer.id);
      const linkedLayer = linkedLayerId
        ? packedLayers.find((candidate) => candidate.id === linkedLayerId)
        : null;
      dragStateRef.current = {
        pointerId: e.pointerId,
        offset: pointerTime - layer.startTime,
        initialStartTime: layer.startTime,
        layers: [
          { layerId: layer.id, initialStartTime: layer.startTime, duration: layer.duration },
          ...(linkedLayer
            ? [
                {
                  layerId: linkedLayer.id,
                  initialStartTime: linkedLayer.startTime,
                  duration: linkedLayer.duration,
                },
              ]
            : []),
        ],
        moved: false,
      };

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is best-effort.
      }
    },
    [calculateUnboundedTimeToX, packedLayers],
  );

  const updateDraggedLayer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== e.pointerId) return;

      const requestedDelta =
        calculateUnboundedTimeToX(e.clientX) - dragState.offset - dragState.initialStartTime;
      const nextDelta = Math.max(
        -Math.min(...dragState.layers.map((layer) => layer.initialStartTime)),
        requestedDelta,
      );
      const nextStartTime = dragState.initialStartTime + nextDelta;
      const movedFromInitial =
        Math.abs(nextStartTime - dragState.initialStartTime) > LAYER_DRAG_COMMIT_THRESHOLD_SECONDS;
      if (!dragState.moved && !movedFromInitial) return;

      dragState.moved = true;
      updateLayerStartTimes(
        dragState.layers.map((layer) => ({
          ...layer,
          startTime: layer.initialStartTime + nextDelta,
        })),
      );
    },
    [calculateUnboundedTimeToX, updateLayerStartTimes],
  );

  const endLayerDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== e.pointerId) return;

      setIsDraggingLayer(false);
      const requestedDelta =
        calculateUnboundedTimeToX(e.clientX) - dragState.offset - dragState.initialStartTime;
      const nextDelta = Math.max(
        -Math.min(...dragState.layers.map((layer) => layer.initialStartTime)),
        requestedDelta,
      );
      const nextStartTime = dragState.initialStartTime + nextDelta;
      const shouldCommit =
        Math.abs(nextStartTime - dragState.initialStartTime) > LAYER_DRAG_COMMIT_THRESHOLD_SECONDS;
      if (shouldCommit) {
        commitLayerStartTimes(
          dragState.layers.map((layer) => ({
            ...layer,
            startTime: layer.initialStartTime + nextDelta,
          })),
        );
      } else if (dragState.moved) {
        updateLayerStartTimes(
          dragState.layers.map((layer) => ({ ...layer, startTime: layer.initialStartTime })),
        );
      }
      suppressNextTimelineClickRef.current = dragState.moved || shouldCommit;
      dragStateRef.current = null;

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Pointer capture may already be released.
      }
    },
    [calculateUnboundedTimeToX, commitLayerStartTimes, updateLayerStartTimes],
  );

  // --- 4. Event Processing Pipeline ---

  // Phase 1: Area Hover
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isModalOpen || dragStateRef.current !== null || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const t = calculateTimeToX(e.clientX);
    const relativeY = e.clientY - rect.top - TRACK_RULER_OFFSET_PX;
    const trackIndex =
      Math.floor((relativeY - TRACK_TOP_PADDING_PX) / TRACK_HEIGHT_PX) + trackOffset;

    const strandUnderMouse = packedLayers.find(
      (l) => l.trackIndex === trackIndex && t >= l.startTime && t <= l.startTime + l.duration,
    );

    setHoverTime(t);
    setGlobalHoverTime(t);
    const targetId = strandUnderMouse?.id || null;
    setHoveredStrandId(targetId);
    setHoveredLayer(targetId);
    setModalPosition({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
    setGlobalHoverTime(null);
    setHoveredStrandId(null);
    setHoveredLayer(null);
  };

  // Phase 3: Area Scroll (Wheel)
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) return;

    // Only scroll if there's an actual overflow
    if (totalTracks <= MAX_TRACKS) return;

    preventDefaultWhenCancelable(e);
    e.stopPropagation();

    const delta = e.deltaY > 0 ? 1 : -1;
    setTrackOffset((prev) => {
      const next = prev + delta;
      return Math.max(0, Math.min(totalTracks - MAX_TRACKS, next));
    });
  };

  const handleScroll = useCallback(() => {
    if (autoScrollRef.current) {
      autoScrollRef.current = false;
      return;
    }

    lastManualScrollAtRef.current = performance.now();
  }, []);

  const applyZoom = useCallback(
    (targetPxPerSec: number, anchorClientX?: number) => {
      if (!scrollContainerRef.current) return;

      const scrollContainer = scrollContainerRef.current;
      const oldPxPerSec = pxPerSec;
      const nextPxPerSec = Math.max(minTimelinePxPerSec, Math.min(MAX_PX_PER_SEC, targetPxPerSec));
      if (Math.abs(nextPxPerSec - oldPxPerSec) < 1e-6) return;

      const rect = scrollContainer.getBoundingClientRect();
      const pointerX =
        anchorClientX !== undefined
          ? Math.max(0, Math.min(rect.width, anchorClientX - rect.left))
          : rect.width / 2;
      const anchorTime = (scrollContainer.scrollLeft + pointerX) / oldPxPerSec;

      setPxPerSec(nextPxPerSec);

      requestAnimationFrame(() => {
        const currentScroller = scrollContainerRef.current;
        if (!currentScroller) return;

        const maxScrollLeft = Math.max(
          0,
          timelineExtent * nextPxPerSec - currentScroller.clientWidth,
        );
        const nextScrollLeft = Math.max(
          0,
          Math.min(maxScrollLeft, anchorTime * nextPxPerSec - pointerX),
        );
        currentScroller.scrollLeft = nextScrollLeft;
      });
    },
    [minTimelinePxPerSec, pxPerSec, setPxPerSec, timelineExtent],
  );

  const handleZoomWheelCapture = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;

    preventDefaultWhenCancelable(e);
    e.stopPropagation();
    applyZoom(e.deltaY < 0 ? pxPerSec * ZOOM_STEP : pxPerSec / ZOOM_STEP, e.clientX);
  };

  const executeTimelineEditAction = useCallback(
    (action: TimelineEditAction) => {
      if (!targetEditLayer) return;

      if (action === 'select-above' || action === 'select-below') {
        const targetLayer = findTimelineLayerAtTrackOffset(
          packedLayers,
          targetEditLayer.id,
          currentTime,
          action === 'select-above' ? -1 : 1,
        );

        if (targetLayer) onSelectLayer(targetLayer.id);
        return;
      }

      if (action === 'step-back-frame') {
        seek(clampTimelineSeekTime(currentTime - TIMELINE_FRAME_STEP_SECONDS));
        return;
      }

      if (action === 'step-forward-frame') {
        seek(clampTimelineSeekTime(currentTime + TIMELINE_FRAME_STEP_SECONDS));
        return;
      }

      if (action === 'step-back-second') {
        seek(clampTimelineSeekTime(currentTime - 1));
        return;
      }

      if (action === 'step-forward-second') {
        seek(clampTimelineSeekTime(currentTime + 1));
        return;
      }

      if (action === 'jump-start') {
        seek(clampTimelineSeekTime(targetEditLayer.startTime));
        return;
      }

      if (action === 'jump-end') {
        seek(clampTimelineSeekTime(targetEditLayer.startTime + targetEditLayer.duration));
        return;
      }

      if (!activeEditLayer) return;

      if (action === 'split') {
        const result = buildSplitTimelineLayerIntents(
          engineStore.getManifest(),
          activeEditLayer,
          currentTime,
        );
        if (!result) return;

        engineStore.executeAtomicIntentBatch(result.intents);
        onSelectLayer(result.createdLayerId);
        return;
      }

      const manifest = engineStore.getManifest();
      const intents =
        action === 'trim-start'
          ? buildTrimTimelineLayerStartIntents(manifest, activeEditLayer, currentTime)
          : buildTrimTimelineLayerEndIntents(manifest, activeEditLayer, currentTime);

      if (intents.length > 0) {
        engineStore.executeAtomicIntentBatch(intents);
      }
    },
    [activeEditLayer, currentTime, onSelectLayer, packedLayers, seek, targetEditLayer],
  );

  useLayoutEffect(() => {
    if (viewportWidth <= 0 || pxPerSec >= minTimelinePxPerSec) {
      return;
    }

    applyZoom(minTimelinePxPerSec);
  }, [applyZoom, minTimelinePxPerSec, pxPerSec, viewportWidth]);

  useLayoutEffect(() => {
    const previousCurrentTime = lastObservedCurrentTimeRef.current;
    const didCurrentTimeChange = Math.abs(currentTime - previousCurrentTime) > 1e-6;
    lastObservedCurrentTimeRef.current = currentTime;

    if (
      (!isPlaying && !didCurrentTimeChange) ||
      viewportWidth <= 0 ||
      !scrollContainerRef.current
    ) {
      return;
    }

    const now = performance.now();
    if (isPlaying && now - lastManualScrollAtRef.current < MANUAL_SCROLL_SUPPRESSION_MS) {
      return;
    }

    const scrollContainer = scrollContainerRef.current;
    const nextScrollLeft = getPlaybackFollowScrollLeft({
      currentTime,
      pxPerSec,
      viewportWidth,
      scrollLeft: scrollContainer.scrollLeft,
      timelineExtent,
    });

    if (nextScrollLeft === null || Math.abs(nextScrollLeft - scrollContainer.scrollLeft) < 1) {
      return;
    }

    autoScrollRef.current = true;
    scrollContainer.scrollLeft = nextScrollLeft;
  }, [currentTime, isPlaying, pxPerSec, timelineExtent, viewportWidth]);

  // Phase 2: Area Click (Case A/B/C)
  const handleTrackClick = (e: React.MouseEvent) => {
    if (suppressNextTimelineClickRef.current) {
      suppressNextTimelineClickRef.current = false;
      return;
    }
    const t = calculateTimeToX(e.clientX);
    setClickTime(t);

    // Filter active CONTENT layers at time T
    // Sort by Z-Index descending (Reverse since engine layers are bottom-to-top)
    const activeLayers = packedLayers.filter(
      (l) => t >= l.startTime && t < l.startTime + l.duration,
    );

    if (activeLayers.length === 0) {
      // Case A: 0 layers - Just seek
      seek(t);
      setIsModalOpen(false);
      setHighlightedLayers([]);
    } else if (activeLayers.length === 1) {
      // Case B: 1 layer - Auto-select and seek to current clicked position
      const target = activeLayers[0];
      seek(t);
      onSelectLayer(target.id);
      setIsModalOpen(false);
      setHighlightedLayers([]);
    } else {
      // Case C: 2+ layers - Open Modal
      setModalPosition({ x: e.clientX, y: e.clientY });
      setIsModalOpen(true);
      setHighlightedLayers(activeLayers.map((l) => l.id));
      // Also seek playhead to current clicked position (standard user expectation)
      seek(t);
    }
  };

  // Calculate hover items for tooltip
  const hoveredLayers = useMemo(() => {
    if (hoverTime === null || hoveredStrandId === null) return [];
    return packedLayers.filter(
      (l) => hoverTime >= l.startTime && hoverTime <= l.startTime + l.duration,
    );
  }, [hoverTime, hoveredStrandId, packedLayers]);

  // Viewport boundary adjustment for HoverTooltip
  useLayoutEffect(() => {
    if (hoverTime !== null && tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect();
      const padding = 20;
      let x = modalPosition.x + 15;
      let y = modalPosition.y - 12;

      if (x + rect.width > window.innerWidth - padding) {
        x = modalPosition.x - rect.width - 15;
      }
      if (y + rect.height > window.innerHeight - padding) {
        y = window.innerHeight - rect.height - padding;
      }
      if (y < padding) {
        y = padding;
      }

      setAdjustedTooltipPos({ x, y });
    } else {
      // Reset or hide when not hovering
      setAdjustedTooltipPos({ x: -1000, y: -1000 });
    }
  }, [hoverTime, modalPosition]);

  // Viewport boundary adjustment for SelectionModal
  useLayoutEffect(() => {
    if (isModalOpen && modalRef.current) {
      const rect = modalRef.current.getBoundingClientRect();
      const padding = 20;
      let x = modalPosition.x + 10;
      let y = modalPosition.y - 10;

      if (x + rect.width > window.innerWidth - padding) {
        x = modalPosition.x - rect.width - 10;
      }
      if (y + rect.height > window.innerHeight - padding) {
        y = window.innerHeight - rect.height - padding;
      }
      if (y < padding) {
        y = padding;
      }

      setAdjustedModalPos({ x, y });
    } else {
      setAdjustedModalPos({ x: -1000, y: -1000 });
    }
  }, [isModalOpen, modalPosition]);

  const isTimelineToolDisabled = (action: TimelineEditAction): boolean => {
    if (action === 'split' || action === 'trim-start' || action === 'trim-end') {
      return activeEditLayer === null;
    }

    return targetEditLayer === null;
  };

  const renderTimelineToolButton = (
    action: TimelineEditAction,
    label: string,
    Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>,
  ) => {
    const disabled = isTimelineToolDisabled(action);

    return (
      <button
        type="button"
        data-f={`timeline-edit-${action}`}
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => executeTimelineEditAction(action)}
        style={getTimelineToolButtonStyle(disabled)}
      >
        <Icon size={14} strokeWidth={2.2} />
      </button>
    );
  };

  return (
    <div
      data-f="timeline-packed-strand-scrubber"
      style={{ width: '100%' }}
      onWheelCapture={handleZoomWheelCapture}
    >
      <div
        data-f="timeline-toolbar"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '6px',
        }}
      >
        <ScaleControlBar
          label={`${Math.round((pxPerSec / DEFAULT_PX_PER_SEC) * 100)}%`}
          ariaLabelPrefix="Timeline"
          resetAriaLabel={t('timeline.resetZoom')}
          zoomOutAriaLabel={t('timeline.zoomOut')}
          zoomInAriaLabel={t('timeline.zoomIn')}
          onReset={() => applyZoom(DEFAULT_PX_PER_SEC)}
          onZoomOut={() => applyZoom(pxPerSec / ZOOM_STEP)}
          onZoomIn={() => applyZoom(pxPerSec * ZOOM_STEP)}
          zoomOutDisabled={pxPerSec <= minTimelinePxPerSec + 1e-6}
          zoomInDisabled={pxPerSec >= MAX_PX_PER_SEC - 1e-6}
        />

        <div
          data-f="timeline-edit-toolbar"
          aria-label={t('timeline.editToolbar')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            minHeight: '24px',
          }}
        >
          {renderTimelineToolButton('split', t('timeline.edit.split'), Scissors)}
          {renderTimelineToolButton('trim-start', t('timeline.edit.trimStart'), SkipBack)}
          {renderTimelineToolButton('trim-end', t('timeline.edit.trimEnd'), SkipForward)}
          {renderTimelineToolButton('select-above', t('timeline.edit.selectAbove'), ArrowUp)}
          {renderTimelineToolButton('select-below', t('timeline.edit.selectBelow'), ArrowDown)}
          {renderTimelineToolButton('step-back-frame', t('timeline.edit.stepBackFrame'), StepBack)}
          {renderTimelineToolButton(
            'step-forward-frame',
            t('timeline.edit.stepForwardFrame'),
            StepForward,
          )}
          {renderTimelineToolButton(
            'step-back-second',
            t('timeline.edit.stepBackSecond'),
            SkipBack,
          )}
          {renderTimelineToolButton(
            'step-forward-second',
            t('timeline.edit.stepForwardSecond'),
            SkipForward,
          )}
          {renderTimelineToolButton('jump-start', t('timeline.edit.jumpStart'), StepBack)}
          {renderTimelineToolButton('jump-end', t('timeline.edit.jumpEnd'), StepForward)}
        </div>

        <button
          type="button"
          data-f="timeline-shortcuts-button"
          aria-label={t('timeline.shortcuts')}
          title={t('timeline.shortcuts')}
          aria-expanded={isShortcutTableOpen}
          onClick={() => setIsShortcutTableOpen((open) => !open)}
          style={timelineToolButtonBaseStyle}
        >
          <List size={14} strokeWidth={2.2} />
        </button>

        {isShortcutTableOpen && (
          <dialog
            open
            data-f="timeline-shortcuts-table"
            aria-label={t('timeline.shortcuts')}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 100,
              width: 'min(360px, calc(100vw - 32px))',
              maxHeight: 'min(420px, calc(100vh - 48px))',
              overflowY: 'auto',
              border: '1px solid rgba(255,255,255,0.16)',
              borderRadius: '8px',
              backgroundColor: 'rgba(20, 20, 24, 0.98)',
              boxShadow: '0 14px 32px rgba(0,0,0,0.34)',
              margin: 0,
              padding: '8px',
            }}
          >
            <div
              data-f="timeline-shortcuts-header"
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: '6px',
              }}
            >
              <button
                type="button"
                data-f="timeline-shortcuts-close-button"
                aria-label={t('global.close')}
                title={t('global.close')}
                onClick={() => setIsShortcutTableOpen(false)}
                style={timelineToolButtonBaseStyle}
              >
                <X size={14} strokeWidth={2.2} />
              </button>
            </div>
            <table
              data-f="timeline-shortcuts-table-content"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '12px',
                color: '#d6d6d6',
              }}
            >
              <tbody data-f="timeline-shortcuts-table-body">
                {TIMELINE_SHORTCUT_ROWS.map((row) => (
                  <tr key={row.labelKey} data-f="timeline-shortcuts-row">
                    <td
                      data-f="timeline-shortcuts-action"
                      style={{ padding: '5px 8px', color: '#aaa' }}
                    >
                      {t(row.labelKey)}
                    </td>
                    <td
                      data-f="timeline-shortcuts-key-cell"
                      style={{ padding: '5px 8px', textAlign: 'right' }}
                    >
                      <kbd
                        data-f="timeline-shortcuts-key"
                        style={{
                          display: 'inline-block',
                          minWidth: '28px',
                          border: '1px solid rgba(255,255,255,0.18)',
                          borderRadius: '5px',
                          backgroundColor: 'rgba(255,255,255,0.07)',
                          padding: '2px 6px',
                          fontFamily: 'monospace',
                          fontSize: '11px',
                          color: '#f2f2f2',
                        }}
                      >
                        {row.shortcut}
                      </kbd>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </dialog>
        )}
      </div>
      <TimeRulerCanvas
        timelineExtent={timelineExtent}
        pxPerSec={pxPerSec}
        scrollContainerRef={scrollContainerRef}
        isEmptyProject={isEmptyProject}
      />
      <div
        data-f="timeline-scroll-container"
        ref={scrollContainerRef}
        className="scrubber-scroll-container"
        onScroll={handleScroll}
        style={{
          width: '100%',
          overflowX: 'auto',
          overflowY: 'hidden',
        }}
      >
        <div
          data-f="timeline-scrubber-container"
          ref={timelineRef}
          className="scrubber-container"
          onClick={handleTrackClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheel}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              if (hoveredStrandId) {
                onSelectLayer(hoveredStrandId);
              } else {
                handleTrackClick(e as unknown as React.MouseEvent);
              }
            }
            if (e.key === 'Escape') {
              setIsModalOpen(false);
              setHighlightedLayers([]);
            }
          }}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={timelineExtent}
          aria-valuenow={currentTime}
          aria-label="Timeline Scrubber"
          tabIndex={0}
          style={{
            position: 'relative',
            width: '100%',
            minWidth: `${timelineWidth}px`,
            height: `${
              (viewableTracks + 1) * TRACK_HEIGHT_PX +
              TRACK_TOP_PADDING_PX * 2 +
              TRACK_RULER_OFFSET_PX
            }px`,
            minHeight: '60px',
            backgroundColor: '#0a0a0c',
            borderRadius: '8px',
            cursor: isDraggingLayer ? 'grabbing' : 'crosshair',
            border: '1px solid rgba(255,255,255,0.05)',
            transition: 'height 0.3s ease',
          }}
        >
          {/* Rulers (Decorative) */}
          <div
            data-f="timeline-grid-overlay"
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0.05,
              pointerEvents: 'none',
            }}
          >
            {[0.2, 0.4, 0.6, 0.8].map((p) => (
              <div
                data-f="timeline-grid-line"
                key={p}
                style={{
                  position: 'absolute',
                  left: `${p * 100}%`,
                  top: 0,
                  bottom: 0,
                  borderLeft: '1px solid #fff',
                }}
              />
            ))}
          </div>

          {/* StrandLine 계층 (Visual Only - Culled) */}
          <div
            data-f="timeline-strands-wrapper"
            className="strands-wrapper"
            style={{ padding: '8px 0', pointerEvents: 'none' }}
          >
            {/* Top Overflow Indicators */}
            {topOverflowIntervals.map((interval) => (
              <div
                key={`top-overflow-${interval.start}`}
                data-f="timeline-top-overflow-interval"
                style={{
                  position: 'absolute',
                  left: `${interval.start * pxPerSec}px`,
                  width: `${(interval.end - interval.start) * pxPerSec}px`,
                  top: '2px',
                  height: '3px',
                  background:
                    'repeating-linear-gradient(45deg, rgba(255,255,255,0.1), rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.2) 2px, rgba(255,255,255,0.2) 4px)',
                  borderRadius: '1.5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '8px',
                  color: 'rgba(255,255,255,0.8)',
                  fontWeight: 'bold',
                  zIndex: 5,
                }}
              >
                <span data-f="timeline-top-overflow-count" style={{ transform: 'translateY(8px)' }}>
                  +{interval.count}
                </span>
              </div>
            ))}

            {/* Bottom Overflow Indicators */}
            {bottomOverflowIntervals.map((interval) => (
              <div
                key={`bottom-overflow-${interval.start}`}
                data-f="timeline-bottom-overflow-interval"
                style={{
                  position: 'absolute',
                  left: `${interval.start * pxPerSec}px`,
                  width: `${(interval.end - interval.start) * pxPerSec}px`,
                  bottom: '4px',
                  height: '4px',
                  background:
                    'repeating-linear-gradient(45deg, rgba(255,255,255,0.1), rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.2) 2px, rgba(255,255,255,0.2) 4px)',
                  borderRadius: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '8px',
                  color: 'rgba(255,255,255,0.6)',
                  fontWeight: 'bold',
                }}
              >
                <span
                  data-f="timeline-bottom-overflow-count"
                  style={{ transform: 'translateY(-14px)' }}
                >
                  +{interval.count}
                </span>
              </div>
            ))}
            {isEmptyProject && (
              <div
                data-f="timeline-playhead-marker"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                  zIndex: 6,
                }}
              >
                <div
                  data-f="timeline-playhead-time-pill"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '8px 14px',
                    borderRadius: '999px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(10, 10, 12, 0.78)',
                    color: 'rgba(235, 235, 245, 0.88)',
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
                    textAlign: 'center',
                  }}
                >
                  <span
                    data-f="timeline-playhead-time-value"
                    style={{ fontSize: '13px', fontWeight: 700 }}
                  >
                    {t('timeline.emptyProject')}
                  </span>
                  <span
                    data-f="timeline-playhead-time-unit"
                    style={{
                      fontSize: '11px',
                      color: 'rgba(235,235,245,0.6)',
                      maxWidth: '240px',
                      marginBottom: '4px',
                    }}
                  >
                    {t('timeline.emptyProjectHint')}
                  </span>
                  <div
                    data-f="timeline-hover-marker"
                    style={{
                      display: 'flex',
                      gap: '6px',
                      fontSize: '9px',
                      color: 'rgba(235,235,245,0.4)',
                    }}
                  >
                    <span
                      data-f="timeline-hover-time-value"
                      style={{
                        padding: '1px 4px',
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: '3px',
                      }}
                    >
                      Zoom: ⌘+ / ⌘-
                    </span>
                    <span
                      data-f="timeline-hover-time-unit"
                      style={{
                        padding: '1px 4px',
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: '3px',
                      }}
                    >
                      Reset: ⌘0
                    </span>
                  </div>
                </div>
              </div>
            )}
            {packedLayers
              .filter((l) => l.trackIndex >= trackOffset && l.trackIndex < trackOffset + MAX_TRACKS)
              .map((layer) => {
                const layerType = getStudioLayerType(layer);
                const linkedLayerId = getLinkedVideoAudioLayerId(
                  engineStore.getManifest(),
                  layer.id,
                );
                const linkedPair = resolveLinkedVideoAudioPair(engineStore.getManifest(), layer.id);
                const videoLayer = linkedPair
                  ? packedLayers.find((candidate) => candidate.id === linkedPair.videoLayerId)
                  : null;
                const strandColor = videoLayer ? getLayerColor(videoLayer) : getLayerColor(layer);
                const left = layer.startTime * pxPerSec;
                const width = layer.duration * pxPerSec;
                const top =
                  (layer.trackIndex - trackOffset) * TRACK_HEIGHT_PX +
                  TRACK_TOP_PADDING_PX +
                  TRACK_RULER_OFFSET_PX;
                const isSelected =
                  layer.id === selectedLayerId || linkedLayerId === selectedLayerId;
                const activeHoveredLayerId = hoveredStrandId ?? hoveredLayerId;
                const isHovered =
                  layer.id === activeHoveredLayerId || linkedLayerId === activeHoveredLayerId;
                const isInfinite = layer.isInfinite === true;
                const isTimelineDraggable =
                  !isInfinite &&
                  !layer.isProjectAnchor &&
                  layerType !== 'scope:start' &&
                  layerType !== 'scope:end';
                const lockedLabel = `${getLayerLabel(layer)}${isInfinite ? ' (locked)' : ''}`;

                return (
                  <div
                    data-f="timeline-strand-item"
                    key={layer.id}
                    className="strand-item"
                    aria-disabled={isInfinite}
                    title={lockedLabel}
                    onMouseDown={(e) => {
                      if (!isInfinite) return;
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onPointerDown={(e) => beginLayerDrag(layer, e)}
                    onPointerMove={updateDraggedLayer}
                    onPointerUp={endLayerDrag}
                    onPointerCancel={endLayerDrag}
                    style={{
                      position: 'absolute',
                      left: `${left}px`,
                      width: `${width}px`,
                      top: `${top}px`,
                      height: isSelected || isHovered ? '8px' : '6px',
                      backgroundColor: strandColor,
                      backgroundImage: isInfinite
                        ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.12) 6px, rgba(255,255,255,0.02) 6px, rgba(255,255,255,0.02) 12px)'
                        : 'none',
                      borderRadius: '4px',
                      boxShadow: isSelected
                        ? `0 0 12px ${strandColor}`
                        : isHovered
                          ? `0 0 10px ${strandColor}aa`
                          : `0 0 8px ${strandColor}44`,
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      border: isSelected
                        ? '1.5px solid #FFF'
                        : isHovered
                          ? '1px solid rgba(255,255,255,0.4)'
                          : 'none',
                      zIndex: isSelected ? 10 : isHovered ? 5 : 1,
                      pointerEvents: isInfinite ? 'none' : 'auto',
                      opacity: isInfinite ? 0.8 : 1,
                      overflow: 'hidden',
                      cursor: isTimelineDraggable
                        ? isDraggingLayer
                          ? 'grabbing'
                          : 'grab'
                        : 'default',
                      touchAction: isTimelineDraggable ? 'none' : 'auto',
                      userSelect: isTimelineDraggable ? 'none' : 'auto',
                    }}
                  >
                    {!isInfinite && (
                      <>
                        <div
                          data-f="timeline-strand-icon-wrap"
                          aria-hidden="true"
                          style={{
                            position: 'absolute',
                            left: '-1px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '5px',
                            height: '14px',
                            borderRadius: '999px',
                            background: 'rgba(255,255,255,0.35)',
                            opacity: isHovered || isSelected ? 1 : 0.55,
                            cursor: 'ew-resize',
                            pointerEvents: 'none',
                          }}
                        />
                        <div
                          data-f="timeline-strand-label-wrap"
                          aria-hidden="true"
                          style={{
                            position: 'absolute',
                            right: '-1px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '5px',
                            height: '14px',
                            borderRadius: '999px',
                            background: 'rgba(255,255,255,0.35)',
                            opacity: isHovered || isSelected ? 1 : 0.55,
                            cursor: 'ew-resize',
                            pointerEvents: 'none',
                          }}
                        />
                      </>
                    )}
                    {isInfinite && (
                      <div
                        data-f="timeline-strand-lock-badge"
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          right: '4px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '1px 5px',
                          borderRadius: '999px',
                          background: 'rgba(10, 10, 12, 0.45)',
                          border: '1px solid rgba(255,255,255,0.16)',
                          color: '#fff',
                          fontSize: '10px',
                          fontWeight: 700,
                          letterSpacing: '0.02em',
                          pointerEvents: 'none',
                        }}
                      >
                        <Lock size={10} strokeWidth={2.5} />
                        <span data-f="timeline-strand-lock-label">Lock</span>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          {/* Hover Line (Faint Red) */}
          {hoverTime !== null && (
            <div
              data-f="timeline-strand-resize-handle"
              style={{
                position: 'absolute',
                left: `${hoverTime * pxPerSec}px`,
                top: 0,
                bottom: 0,
                width: '1.5px',
                backgroundColor: 'rgba(255, 75, 75, 0.4)',
                zIndex: 15,
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Playhead */}
          <div
            data-f="timeline-tooltip-anchor"
            style={{
              position: 'absolute',
              left: `${currentTime * pxPerSec}px`,
              top: 0,
              bottom: 0,
              width: '1.5px',
              backgroundColor: '#FF4B4B',
              boxShadow: '0 0 10px rgba(255, 75, 75, 0.8)',
              zIndex: 20,
              pointerEvents: 'none',
            }}
          />

          {/* HoverTooltip (Transient Result) */}
          {hoverTime !== null && !isModalOpen && hoveredLayers.length > 0 && (
            <div
              data-f="timeline-hover-tooltip"
              ref={tooltipRef}
              className="hover-tooltip"
              style={{
                position: 'fixed',
                left: adjustedTooltipPos.x,
                top: adjustedTooltipPos.y,
                backgroundColor: 'rgba(10, 10, 12, 0.96)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px',
                padding: '10px 14px',
                zIndex: 100,
                pointerEvents: 'none',
                boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                fontSize: '12px',
              }}
            >
              <div
                data-f="timeline-hover-tooltip-body"
                style={{
                  color: '#777',
                  fontSize: '10px',
                  marginBottom: '6px',
                  fontWeight: 'bold',
                }}
              >
                {hoverTime.toFixed(2)}s • {hoveredLayers.length} Layers
              </div>
              {hoveredLayers.map((l) => {
                const isDirectlyHovered = l.id === hoveredStrandId;
                return (
                  <div
                    data-f="timeline-hover-tooltip-layer"
                    key={l.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '4px 8px',
                      margin: '0 -8px',
                      color: '#eee',
                      backgroundColor: isDirectlyHovered ? 'rgba(255,255,255,0.08)' : 'transparent',
                      borderRadius: '4px',
                      transform: isDirectlyHovered ? 'translateX(4px)' : 'none',
                      boxShadow: isDirectlyHovered ? 'inset 2px 0 0 rgba(255,255,255,0.4)' : 'none',
                      transition: 'all 0.2s cubic-bezier(0.19, 1, 0.22, 1)',
                    }}
                  >
                    <div
                      data-f="timeline-hover-tooltip-layer-header"
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: getLayerColor(l),
                        boxShadow: isDirectlyHovered ? `0 0 8px ${getLayerColor(l)}` : 'none',
                      }}
                    />
                    <span
                      data-f="timeline-hover-tooltip-layer-name"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        marginRight: '4px',
                      }}
                    >
                      {getLayerIcon(
                        getStudioLayerType(l),
                        getLayerColor(l),
                        isDirectlyHovered ? 14 : 12,
                      )}
                    </span>
                    <span
                      data-f="timeline-hover-tooltip-layer-time"
                      style={{
                        fontWeight: isDirectlyHovered ? '600' : 'normal',
                        fontSize: isDirectlyHovered ? '12px' : '11px',
                      }}
                    >
                      {getLayerLabel(l)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* SelectionModal (Persistent Context) */}
          {isModalOpen && clickTime !== null && (
            <>
              {/* Backdrop for click-away */}
              <button
                data-f="timeline-selection-backdrop"
                type="button"
                className="modal-backdrop"
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 1000,
                  backgroundColor: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'default',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsModalOpen(false);
                  setHighlightedLayers([]);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    setIsModalOpen(false);
                    setHighlightedLayers([]);
                  }
                }}
                aria-label="Close selection modal"
              />
              <dialog
                data-f="timeline-selection-dialog"
                open
                ref={modalRef}
                className="selection-modal"
                style={{
                  position: 'fixed',
                  left: adjustedModalPos.x,
                  top: adjustedModalPos.y,
                  minWidth: '220px',
                  backgroundColor: 'rgba(20, 20, 24, 0.98)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '12px',
                  padding: '8px',
                  margin: 0, // Reset dialog default margin
                  zIndex: 1001,
                  boxShadow: '0 16px 40px rgba(0,0,0,0.7)',
                  pointerEvents: 'auto',
                  animation: 'modalEntrance 0.25s cubic-bezier(0, 0, 0.2, 1)',
                  color: 'inherit', // Ensure text color is inherited
                }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsModalOpen(false);
                    setHighlightedLayers([]);
                  }
                }}
                aria-label="Layer selection"
                tabIndex={-1}
              >
                <div
                  data-f="timeline-selection-header"
                  style={{
                    fontSize: '11px',
                    color: '#666',
                    padding: '6px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    marginBottom: '6px',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span data-f="timeline-selection-time">T: {clickTime.toFixed(2)}s</span>
                  <span data-f="timeline-selection-count">{hoveredLayers.length} Items</span>
                </div>

                <div
                  data-f="timeline-selection-content"
                  className="modal-content-wrapper"
                  style={{
                    maxHeight: '300px',
                    overflowY: 'auto',
                    borderRadius: '4px',
                  }}
                >
                  {(() => {
                    const activeLayersAtClick = packedLayers.filter(
                      (l) => clickTime >= l.startTime && clickTime < l.startTime + l.duration,
                    );

                    const shouldCluster = activeLayersAtClick.length > CLUSTERING_THRESHOLD;

                    if (shouldCluster) {
                      // Group by type
                      const groups: Record<string, IPackedLayer[]> = {};
                      for (const l of activeLayersAtClick) {
                        const t = getStudioLayerType(l) || 'Other';
                        if (!groups[t]) groups[t] = [];
                        groups[t].push(l);
                      }

                      return Object.entries(groups).map(([type, groupLayers]) => (
                        <div data-f="timeline-selection-group" key={type} className="modal-group">
                          <div
                            data-f="timeline-selection-group-header"
                            className="group-header"
                            style={{
                              position: 'sticky',
                              top: 0,
                              backgroundColor: 'rgba(30, 30, 35, 0.95)',
                              padding: '6px 12px',
                              fontSize: '10px',
                              fontWeight: 'bold',
                              color: '#aaa',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              zIndex: 10,
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                            }}
                          >
                            {type}s ({groupLayers.length})
                          </div>
                          {groupLayers.map((l) => (
                            <LayerModalItem
                              key={l.id}
                              layer={l}
                              allLayers={visibleLayers}
                              isSelected={selectedLayerId === l.id}
                              onSelect={(id) => {
                                onSelectLayer(id);
                                setIsModalOpen(false);
                                setHighlightedLayers([]);
                              }}
                              onHover={(id) => setHoveredLayer(id)}
                              onMouseLeave={() => setHoveredLayer(null)}
                              getLayerColor={getLayerColor}
                            />
                          ))}
                        </div>
                      ));
                    }

                    // Standard non-clustered list
                    return activeLayersAtClick.map((l) => (
                      <LayerModalItem
                        key={l.id}
                        layer={l}
                        allLayers={visibleLayers}
                        isSelected={selectedLayerId === l.id}
                        onSelect={(id) => {
                          onSelectLayer(id);
                          setIsModalOpen(false);
                          setHighlightedLayers([]);
                        }}
                        onHover={(id) => setHoveredLayer(id)}
                        onMouseLeave={() => setHoveredLayer(null)}
                        getLayerColor={getLayerColor}
                      />
                    ));
                  })()}
                </div>
              </dialog>
            </>
          )}

          <style data-f="timeline-inline-styles">{`
				@keyframes modalEntrance {
					from { opacity: 0; transform: scale(0.95) translateY(10px); }
					to { opacity: 1; transform: scale(1) translateY(0); }
				}
				.modal-item:hover {
					background-color: rgba(255, 255, 255, 0.08) !important;
				}
				.scrubber-container:focus {
					outline: none;
					box-shadow: 0 0 0 2px rgba(255, 75, 75, 0.4);
				}
			`}</style>
        </div>
      </div>
    </div>
  );
};

/**
 * Sub-component for individual layer items in the selection modal.
 */
const LayerModalItem: React.FC<{
  layer: IPackedLayer;
  allLayers: ILayer[];
  isSelected: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string) => void;
  onMouseLeave: () => void;
  getLayerColor: (l: IPackedLayer) => string;
}> = ({ layer, allLayers, isSelected, onSelect, onHover, onMouseLeave, getLayerColor }) => {
  const parentSequence = allLayers.find((sl) => sl.id === layer.parentSequenceId);
  const sequenceLabel = parentSequence ? parentSequence.name || parentSequence.id : 'Project';

  return (
    <button
      data-f="timeline-layer-modal-item"
      type="button"
      className="modal-item"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        textAlign: 'left',
        background: 'none',
        border: 'none',
        padding: '10px 14px',
        borderRadius: '8px',
        cursor: 'pointer',
        color: '#fff',
        transition: 'background 0.2s',
        backgroundColor: isSelected ? 'rgba(255,255,255,0.05)' : 'transparent',
        outline: 'none',
      }}
      onClick={() => onSelect(layer.id)}
      onMouseEnter={() => onHover(layer.id)}
      onMouseLeave={onMouseLeave}
    >
      <div
        data-f="timeline-layer-modal-main"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <div
          data-f="timeline-layer-modal-title-row"
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: getLayerColor(layer),
            boxShadow: `0 0 10px ${getLayerColor(layer)}66`,
          }}
        />
        <span data-f="timeline-layer-modal-icon" style={{ display: 'flex', alignItems: 'center' }}>
          {getLayerIcon(getStudioLayerType(layer), getLayerColor(layer), 14)}
        </span>
        <span data-f="timeline-layer-modal-label" style={{ fontWeight: 600, fontSize: '13px' }}>
          {getLayerLabel(layer)}
        </span>
      </div>
      <span
        data-f="timeline-layer-modal-meta"
        style={{
          fontSize: '10px',
          color: '#888',
          marginLeft: '20px',
          marginTop: '4px',
        }}
      >
        {layer.startTime.toFixed(2)}s • Sequence: {sequenceLabel}
      </span>
    </button>
  );
};
