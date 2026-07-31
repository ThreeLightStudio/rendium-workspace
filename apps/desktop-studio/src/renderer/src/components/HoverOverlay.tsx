import { type IUpdateTransformIntent, engineStore } from '@rendium/engine';
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useEngineStore } from '../hooks/useEngineStore';
import { useLocale } from '../i18n/locale';
import { useStudioStore } from '../stores/studioStore';
import {
  type Point,
  type PreviewFrame,
  type ResizeHandle,
  buildGroupBoundsFrame,
  buildPreviewFrame,
  getCanvasPointFromClient,
  getQuadBounds,
  quadToPointsString,
  resizeQuadFromHandle,
  updateGroupFramesFromMove,
  updateGroupFramesFromRotate,
  updateGroupFramesFromScale,
  updateSingleFrameFromResize,
} from '../utils/previewGeometry';

interface HoverOverlayProps {
  isPlaying?: boolean;
  togglePlay?: () => void;
  width?: number;
  height?: number;
}

type RenderedFrame = PreviewFrame;

type ActiveInteractionMode = 'move' | 'resize' | 'rotate';
type TransformUpdate = Partial<{ position: Point; scale: Point; rotation: number }>;

type ActiveInteraction = {
  mode: ActiveInteractionMode;
  pointerId: number;
  frameIds: string[];
  frames: RenderedFrame[];
  groupFrame: PreviewFrame | null;
  handle?: ResizeHandle;
  startPoint: Point;
  pivot: Point;
  startAngle: number;
  didMove: boolean;
  latestUpdates: Map<string, TransformUpdate>;
};

const HANDLE_SIZE_PX = 16;
const ROTATE_HANDLE_RADIUS_PX = 8;
const ROTATE_HANDLE_OFFSET_PX = 30;
const LABEL_HEIGHT = 20;

function clonePoint(point: Point): Point {
  return { x: point.x, y: point.y };
}

function cloneQuad(quad: PreviewFrame['quad']): PreviewFrame['quad'] {
  return quad.map((point) => clonePoint(point)) as unknown as PreviewFrame['quad'];
}

function cloneFrame(frame: RenderedFrame): RenderedFrame {
  return {
    ...frame,
    origin: clonePoint(frame.origin),
    center: clonePoint(frame.center),
    xAxis: clonePoint(frame.xAxis),
    yAxis: clonePoint(frame.yAxis),
    bounds: { ...frame.bounds },
    scaleReference: { ...frame.scaleReference },
    scaleSign: { ...frame.scaleSign },
    anchor: clonePoint(frame.anchor),
    quad: cloneQuad(frame.quad),
  };
}

function clonePreviewFrame(frame: PreviewFrame): PreviewFrame {
  return {
    ...frame,
    origin: clonePoint(frame.origin),
    center: clonePoint(frame.center),
    xAxis: clonePoint(frame.xAxis),
    yAxis: clonePoint(frame.yAxis),
    bounds: { ...frame.bounds },
    scaleReference: { ...frame.scaleReference },
    scaleSign: { ...frame.scaleSign },
    anchor: clonePoint(frame.anchor),
    quad: cloneQuad(frame.quad),
  };
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scalePoint(point: Point, factor: number): Point {
  return { x: point.x * factor, y: point.y * factor };
}

function pointLength(point: Point): number {
  return Math.hypot(point.x, point.y);
}

function normalizePoint(point: Point): Point {
  const len = pointLength(point);
  if (len === 0) {
    return { x: 1, y: 0 };
  }
  return { x: point.x / len, y: point.y / len };
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

function getRotationHandlePosition(frame: PreviewFrame, offset: number): Point {
  const topMid = midpoint(frame.quad[0], frame.quad[1]);
  const edge = subtract(frame.quad[1], frame.quad[0]);
  let normal = normalizePoint({ x: -edge.y, y: edge.x });
  const inward = subtract(frame.center, topMid);
  if (dot(normal, inward) > 0) {
    normal = scalePoint(normal, -1);
  }
  return add(topMid, scalePoint(normal, offset));
}

function getHitLabelWidth(label: string): number {
  return Math.max(72, label.length * 7 + 18);
}

export function HoverOverlay({ isPlaying = false, togglePlay, width, height }: HoverOverlayProps) {
  const { t } = useLocale();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const interactionRef = useRef<ActiveInteraction | null>(null);
  const [overlaySize, setOverlaySize] = useState({ width: 1, height: 1 });

  const { layers, width: logicalWidth, height: logicalHeight } = useEngineStore();
  const hoveredLayerId = useStudioStore((state) => state.hoveredLayerId);
  const selectedLayerIds = useStudioStore((state) => state.selectedLayerIds);
  const selectLayer = useStudioStore((state) => state.selectLayer);
  const toggleSelectedLayer = useStudioStore((state) => state.toggleSelectedLayer);
  const clearSelection = useStudioStore((state) => state.clearSelection);
  const setHoveredLayer = useStudioStore((state) => state.setHoveredLayer);

  const canvasWidth = Math.max(1, width ?? logicalWidth ?? 1920);
  const canvasHeight = Math.max(1, height ?? logicalHeight ?? 1080);
  const overlayScale =
    overlaySize.width > 1 && overlaySize.height > 1
      ? Math.max(
          0.0001,
          Math.min(overlaySize.width / canvasWidth, overlaySize.height / canvasHeight),
        )
      : 1;
  const handleSize = HANDLE_SIZE_PX / overlayScale;
  const rotateHandleRadius = ROTATE_HANDLE_RADIUS_PX / overlayScale;
  const rotateHandleOffset = ROTATE_HANDLE_OFFSET_PX / overlayScale;
  const frameStrokeWidth = 1.5;
  const selectionStrokeWidth = 2;
  const hitStrokeWidth = 16;
  const labelStrokeWidth = 1;

  useEffect(() => {
    const node = svgRef.current;
    if (!node) {
      return;
    }

    let frameId = 0;
    const measure = () => {
      if (frameId !== 0) {
        cancelAnimationFrame(frameId);
      }

      frameId = requestAnimationFrame(() => {
        const rect = node.getBoundingClientRect();
        setOverlaySize((current) => {
          if (
            Math.abs(current.width - rect.width) < 0.5 &&
            Math.abs(current.height - rect.height) < 0.5
          ) {
            return current;
          }

          return {
            width: rect.width || canvasWidth,
            height: rect.height || canvasHeight,
          };
        });
      });
    };

    measure();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    resizeObserver?.observe(node);
    window.addEventListener('resize', measure);

    return () => {
      if (frameId !== 0) {
        cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [canvasHeight, canvasWidth]);

  const frames = useMemo<RenderedFrame[]>(() => {
    const result: RenderedFrame[] = [];
    for (const layer of layers) {
      const frame = buildPreviewFrame(layer, canvasWidth, canvasHeight);
      if (!frame) {
        continue;
      }

      result.push({
        ...frame,
      });
    }

    return result;
  }, [canvasWidth, canvasHeight, layers]);

  const frameById = useMemo(() => {
    return new Map(frames.map((frame) => [frame.id, frame] as const));
  }, [frames]);

  const interactiveSelectedFrames = useMemo(() => {
    const selectedSet = new Set(selectedLayerIds);
    return frames.filter((frame) => selectedSet.has(frame.id));
  }, [frames, selectedLayerIds]);

  const primarySelection = interactiveSelectedFrames[0] ?? null;
  const groupFrame = useMemo(
    () =>
      interactiveSelectedFrames.length > 1
        ? buildGroupBoundsFrame(interactiveSelectedFrames)
        : null,
    [interactiveSelectedFrames],
  );

  const selectionBoundsLabel = t('rightPanel.selection', {
    count: interactiveSelectedFrames.length,
  });

  const activeSelectionIds = useMemo(
    () => interactiveSelectedFrames.map((frame) => frame.id),
    [interactiveSelectedFrames],
  );

  const pausePlaybackIfNeeded = () => {
    if (isPlaying && togglePlay) {
      togglePlay();
    }
  };

  const startInteraction = (
    mode: ActiveInteractionMode,
    event: ReactPointerEvent<SVGElement>,
    options: {
      frames: RenderedFrame[];
      groupFrame: PreviewFrame | null;
      handle?: ResizeHandle;
      pivot?: Point;
      startAngle?: number;
    },
  ) => {
    pausePlaybackIfNeeded();

    const startPoint = getCanvasPointFromClient(
      event.clientX,
      event.clientY,
      svgRef.current,
      canvasWidth,
      canvasHeight,
    );

    interactionRef.current = {
      mode,
      pointerId: event.pointerId,
      frameIds: options.frames.map((frame) => frame.id),
      frames: options.frames.map(cloneFrame),
      groupFrame: options.groupFrame ? clonePreviewFrame(options.groupFrame) : null,
      handle: options.handle,
      startPoint,
      pivot: options.pivot ?? options.groupFrame?.center ?? options.frames[0]?.center ?? startPoint,
      startAngle: options.startAngle ?? 0,
      didMove: false,
      latestUpdates: new Map(),
    };

    try {
      svgRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // Best effort only.
    }
  };

  const dispatchTransientUpdates = (updates: Map<string, TransformUpdate>) => {
    for (const [layerId, partial] of updates) {
      engineStore.dispatchTransient({
        type: 'TRANSIENT_LAYER_UPDATE',
        layerId,
        partial,
      });
    }
  };

  const resetInteractionToStart = (interaction: ActiveInteraction) => {
    dispatchTransientUpdates(updateGroupFramesFromMove(interaction.frames, { x: 0, y: 0 }));
  };

  const commitInteraction = () => {
    const interaction = interactionRef.current;
    if (!interaction) {
      return;
    }

    if (!interaction.didMove) {
      if (interaction.latestUpdates.size > 0) {
        resetInteractionToStart(interaction);
      }
      interactionRef.current = null;
      return;
    }

    const intents: IUpdateTransformIntent[] = [];
    for (const [layerId, transform] of interaction.latestUpdates) {
      const intent: IUpdateTransformIntent = {
        type: 'UPDATE_TRANSFORM',
        layerId,
        ...(transform.position ? { position: { ...transform.position } } : {}),
        ...(transform.scale ? { scale: { ...transform.scale } } : {}),
        ...(typeof transform.rotation === 'number' ? { rotation: transform.rotation } : {}),
      };

      intents.push(intent);
    }

    if (intents.length > 0) {
      engineStore.executeAtomicIntentBatch(intents);
    }

    interactionRef.current = null;
  };

  const updateCurrentInteraction = (event: ReactPointerEvent<SVGElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const currentPoint = getCanvasPointFromClient(
      event.clientX,
      event.clientY,
      svgRef.current,
      canvasWidth,
      canvasHeight,
    );

    if (interaction.mode === 'move') {
      const delta = subtract(currentPoint, interaction.startPoint);
      if (pointLength(delta) > 0.5) {
        interaction.didMove = true;
      }
      const updates = updateGroupFramesFromMove(interaction.frames, delta);
      interaction.latestUpdates = updates;
      dispatchTransientUpdates(updates);
      return;
    }

    if (interaction.mode === 'rotate') {
      const currentAngle = Math.atan2(
        currentPoint.y - interaction.pivot.y,
        currentPoint.x - interaction.pivot.x,
      );
      const delta = currentAngle - interaction.startAngle;
      if (Math.abs(delta) > 0.001) {
        interaction.didMove = true;
      }
      const updates = updateGroupFramesFromRotate(interaction.frames, interaction.pivot, delta);
      interaction.latestUpdates = updates;
      dispatchTransientUpdates(updates);
      return;
    }

    if (interaction.mode === 'resize') {
      if (!interaction.handle) {
        return;
      }

      if (interaction.frames.length === 1) {
        interaction.didMove = true;
        const update = updateSingleFrameFromResize(
          interaction.frames[0],
          interaction.handle,
          currentPoint,
        );
        const updates = new Map([[interaction.frames[0].id, update]]);
        interaction.latestUpdates = updates;
        dispatchTransientUpdates(updates);
        return;
      }

      const selectionGroup = interaction.groupFrame;
      if (!selectionGroup) {
        return;
      }

      const nextGroupQuad = resizeQuadFromHandle(selectionGroup, interaction.handle, currentPoint);
      const nextGroupBounds = getQuadBounds(nextGroupQuad);
      if (
        Math.abs(nextGroupBounds.width - selectionGroup.bounds.width) > 0.5 ||
        Math.abs(nextGroupBounds.height - selectionGroup.bounds.height) > 0.5
      ) {
        interaction.didMove = true;
      }
      const updates = updateGroupFramesFromScale(
        interaction.frames,
        selectionGroup.bounds,
        nextGroupBounds,
      );
      interaction.latestUpdates = updates;
      dispatchTransientUpdates(updates);
    }
  };

  const handleBackgroundPointerDown = (event: ReactPointerEvent<SVGRectElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (activeSelectionIds.length > 0) {
      clearSelection();
    }
  };

  const handleRotatePointerDown = (event: ReactPointerEvent<SVGCircleElement | SVGLineElement>) => {
    if (!primarySelection) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    const framesToUse =
      interactiveSelectedFrames.length > 1 ? interactiveSelectedFrames : [primarySelection];
    if (framesToUse.length === 0) {
      return;
    }
    const selectedGroup = groupFrame ?? primarySelection;
    const startPoint = getCanvasPointFromClient(
      event.clientX,
      event.clientY,
      svgRef.current,
      canvasWidth,
      canvasHeight,
    );
    const pivot = selectedGroup.center;
    const startAngle = Math.atan2(startPoint.y - pivot.y, startPoint.x - pivot.x);

    startInteraction('rotate', event, {
      frames: framesToUse,
      groupFrame: selectedGroup,
      pivot,
      startAngle,
    });
  };

  const handleResizePointerDown = (
    handle: ResizeHandle,
    event: ReactPointerEvent<SVGRectElement>,
  ) => {
    if (!primarySelection) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    const framesToUse =
      interactiveSelectedFrames.length > 1 ? interactiveSelectedFrames : [primarySelection];
    if (framesToUse.length === 0) {
      return;
    }
    const nextGroupFrame = groupFrame ?? primarySelection;

    startInteraction('resize', event, {
      frames: framesToUse,
      groupFrame: nextGroupFrame,
      handle,
    });
  };

  const handlePointerLeave = () => {
    if (!interactionRef.current) {
      setHoveredLayer(null);
    }
  };

  const renderFrameHandles = (frame: PreviewFrame, color: string, includeEdgeHandles = false) => {
    const [topLeft, topRight, bottomRight, bottomLeft] = frame.quad;
    const handles: Array<{ key: ResizeHandle; point: Point }> = [
      { key: 'nw', point: topLeft },
      { key: 'n', point: midpoint(topLeft, topRight) },
      { key: 'ne', point: topRight },
      { key: 'e', point: midpoint(topRight, bottomRight) },
      { key: 'se', point: bottomRight },
      { key: 's', point: midpoint(bottomLeft, bottomRight) },
      { key: 'sw', point: bottomLeft },
      { key: 'w', point: midpoint(topLeft, bottomLeft) },
    ];
    const visibleHandles = includeEdgeHandles
      ? handles
      : handles.filter(({ key }) => key === 'nw' || key === 'ne' || key === 'se' || key === 'sw');
    const rotationHandle = getRotationHandlePosition(frame, rotateHandleOffset);
    const topCenter = midpoint(topLeft, topRight);

    return (
      <g pointerEvents="none">
        <line
          x1={topCenter.x}
          y1={topCenter.y}
          x2={rotationHandle.x}
          y2={rotationHandle.y}
          stroke="rgba(255, 179, 71, 0.8)"
          strokeWidth={frameStrokeWidth}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        <g transform={`translate(${rotationHandle.x}, ${rotationHandle.y})`} pointerEvents="all">
          <circle
            r={rotateHandleRadius}
            fill="rgba(255, 179, 71, 0.95)"
            stroke="rgba(255,255,255,0.95)"
            strokeWidth={frameStrokeWidth}
            vectorEffect="non-scaling-stroke"
            onPointerDown={handleRotatePointerDown}
          />
        </g>

        {visibleHandles.map(({ key, point }) => (
          <g key={key} transform={`translate(${point.x}, ${point.y})`} pointerEvents="all">
            <rect
              x={-handleSize / 2}
              y={-handleSize / 2}
              width={handleSize}
              height={handleSize}
              rx={2}
              fill="#0a0a0c"
              stroke={color}
              strokeWidth={frameStrokeWidth}
              vectorEffect="non-scaling-stroke"
              onPointerDown={(event) => handleResizePointerDown(key, event)}
            />
          </g>
        ))}
      </g>
    );
  };

  const renderFrameOutline = (frame: RenderedFrame, selected: boolean, hovered: boolean) => {
    const stroke = selected ? '#00BFFF' : hovered ? '#FF6B6B' : 'rgba(255,255,255,0.15)';
    const fill = selected
      ? 'rgba(0, 191, 255, 0.08)'
      : hovered
        ? 'rgba(255, 107, 107, 0.08)'
        : 'rgba(255,255,255,0.03)';

    return (
      <g pointerEvents="none">
        <polygon
          points={quadToPointsString(frame.quad)}
          fill={fill}
          stroke={stroke}
          strokeWidth={selected ? selectionStrokeWidth : frameStrokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    );
  };

  const handleHitPointerDown = (
    frame: RenderedFrame,
    event: ReactPointerEvent<SVGPolygonElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    const isAdditive = event.metaKey || event.ctrlKey || event.shiftKey;
    const isSelected = activeSelectionIds.includes(frame.id);

    if (isAdditive) {
      toggleSelectedLayer(frame.id);
      return;
    }

    if (!isSelected) {
      selectLayer(frame.id);
    }

    const framesToUse =
      isSelected && activeSelectionIds.length > 1
        ? activeSelectionIds
            .map((id) => frameById.get(id))
            .filter((value): value is RenderedFrame => Boolean(value))
        : [frame];
    if (framesToUse.length === 0) {
      return;
    }
    const nextGroupFrame = framesToUse.length > 1 ? buildGroupBoundsFrame(framesToUse) : null;

    startInteraction('move', event, {
      frames: framesToUse,
      groupFrame: nextGroupFrame,
      pivot: nextGroupFrame?.center ?? framesToUse[0]?.center,
    });
  };

  const handleHitPointerEnter = (frame: RenderedFrame) => {
    if (!interactionRef.current) {
      setHoveredLayer(frame.id);
    }
  };

  const handleHitPointerLeave = (frame: RenderedFrame) => {
    if (!interactionRef.current && hoveredLayerId === frame.id) {
      setHoveredLayer(null);
    }
  };

  useEffect(() => {
    return () => {
      interactionRef.current = null;
      setHoveredLayer(null);
    };
  }, [setHoveredLayer]);

  const visibleFrames = frames;
  const selectionFrame = activeSelectionIds.length > 1 ? groupFrame : primarySelection;

  const selectedFrameMap = new Map(activeSelectionIds.map((id) => [id, true] as const));

  return (
    <svg
      ref={svgRef}
      className="hover-overlay"
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      preserveAspectRatio="none"
      aria-label={t('editor.layerInspector')}
      style={{
        position: 'absolute',
        inset: 0,
        touchAction: 'none',
        userSelect: 'none',
      }}
      onPointerMove={updateCurrentInteraction}
      onPointerUp={(event) => {
        updateCurrentInteraction(event);
        commitInteraction();
        try {
          svgRef.current?.releasePointerCapture(event.pointerId);
        } catch {
          // Pointer capture is best-effort.
        }
      }}
      onPointerCancel={(event) => {
        const interaction = interactionRef.current;
        if (interaction && interaction.pointerId === event.pointerId) {
          resetInteractionToStart(interaction);
          interactionRef.current = null;
        }
      }}
      onPointerLeave={handlePointerLeave}
    >
      <title>{t('editor.layerInspector')}</title>
      <rect
        x={0}
        y={0}
        width={canvasWidth}
        height={canvasHeight}
        fill="transparent"
        pointerEvents="all"
        onPointerDown={handleBackgroundPointerDown}
      />

      {selectionFrame && activeSelectionIds.length > 1 && (
        <polygon
          points={quadToPointsString(selectionFrame.quad)}
          fill="rgba(0, 191, 255, 0.04)"
          stroke="rgba(0, 191, 255, 0.7)"
          strokeWidth={selectionStrokeWidth}
          strokeDasharray="10 6"
          vectorEffect="non-scaling-stroke"
          pointerEvents="all"
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            startInteraction('move', event, {
              frames: activeSelectionIds
                .map((id) => frameById.get(id))
                .filter((value): value is RenderedFrame => Boolean(value)),
              groupFrame: selectionFrame,
              pivot: selectionFrame.center,
            });
          }}
        />
      )}

      {visibleFrames.map((frame) => {
        const selected = selectedFrameMap.has(frame.id);
        const hovered = hoveredLayerId === frame.id;
        const isSelectedOutline = selected || hovered;
        const shouldShowHit = true;

        return (
          <g key={frame.id}>
            {shouldShowHit && (
              <polygon
                points={quadToPointsString(frame.quad)}
                fill="transparent"
                stroke="transparent"
                strokeWidth={hitStrokeWidth}
                vectorEffect="non-scaling-stroke"
                pointerEvents="all"
                onPointerDown={(event) => handleHitPointerDown(frame, event)}
                onPointerEnter={() => handleHitPointerEnter(frame)}
                onPointerLeave={() => handleHitPointerLeave(frame)}
              />
            )}

            {isSelectedOutline && renderFrameOutline(frame, selected, hovered)}

            {selected &&
              activeSelectionIds.length === 1 &&
              renderFrameHandles(frame, '#00BFFF', true)}
          </g>
        );
      })}

      {selectionFrame &&
        activeSelectionIds.length > 1 &&
        renderFrameHandles(selectionFrame, '#00BFFF')}

      {selectionFrame && activeSelectionIds.length > 1 && (
        <g
          pointerEvents="none"
          transform={`translate(${selectionFrame.bounds.left}, ${selectionFrame.bounds.top})`}
        >
          <rect
            x={0}
            y={-LABEL_HEIGHT - 6}
            width={getHitLabelWidth(selectionBoundsLabel)}
            height={LABEL_HEIGHT}
            rx={8}
            fill="rgba(0, 191, 255, 0.95)"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth={labelStrokeWidth}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={10}
            y={-LABEL_HEIGHT / 2 + 1}
            fill="#fff"
            fontSize={11}
            fontWeight={700}
            letterSpacing="0.04em"
            dominantBaseline="middle"
          >
            {selectionBoundsLabel}
          </text>
        </g>
      )}
    </svg>
  );
}
