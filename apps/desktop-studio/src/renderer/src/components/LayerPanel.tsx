import type { ILayer, ScopeRoleType } from '@rendium/engine';
import { engineStore } from '@rendium/engine';
import {
  Activity,
  Film,
  Image as ImageIcon,
  type LucideIcon,
  Plus,
  Type,
  Volume2,
} from 'lucide-react';
import {
  type ChangeEvent,
  Fragment,
  type KeyboardEvent,
  type MouseEvent,
  useRef,
  useState,
} from 'react';
import { useEngineStore } from '../hooks/useEngineStore';
import { useLayerPanelDrag } from '../hooks/useLayerPanelDrag';
import { useLayerTree } from '../hooks/useLayerTree';
import { translate } from '../i18n/locale';
import { useStudioStore } from '../stores/studioStore';
import { useProjectAssetsStore } from '../stores/useProjectAssetsStore';
import { readAudioDurationFromUrl } from '../utils/audio';
import { buildLinkedAudioTimingPatch } from '../utils/audioLinking';
import {
  isUnsupportedVideoFileError,
  isVideoImportCandidate,
  VIDEO_IMPORT_ACCEPT,
} from '../utils/videoImport';
import {
  createAudioLayerManifest,
  createImageLayerManifest,
  createSpectrumLayerManifest,
  createVideoAudioLayerManifest,
  createVideoLayerManifest,
  getAllowedStudioLayerTypes,
  getScopeRole,
  getStudioLayerType,
} from '../utils/canonicalLayer';
import type { UITreeNode } from '../utils/layerTree';
import { buildDeleteSelectionIntents } from '../utils/selectionActions';
import { buildCenteredTextLayerManifest } from '../utils/textLayer';
import { LayerPanelItem } from './LayerPanelItem';
import { toast } from './ToastSystem';

interface LayerPanelProps {
  onSelectLayer: (id: string | null) => void;
  selectedLayerId: string | null;
  currentTime: number;
}

type SequenceAddableLayerType = 'video' | 'audio' | 'text' | 'image' | 'spectrum';

type SequenceAddMenuOption = {
  type: SequenceAddableLayerType;
  label: string;
  description: string;
  icon: LucideIcon;
};

const DEFAULT_NEW_LAYER_DURATION = 5;
const OVERLAY_IMAGE_DEFAULT_SIZE = { width: 640, height: 360 } as const;

function resolveMediaLayerDuration(duration: number | null | undefined): number {
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0
    ? duration
    : DEFAULT_NEW_LAYER_DURATION;
}

function isLayerActiveAtScopeTime(layer: ILayer, scopeLocalTime: number): boolean {
  if (layer.isProjectAnchor || layer.isInfinite) return true;
  if (layer.duration <= 0) return false;

  return scopeLocalTime >= layer.startTime && scopeLocalTime < layer.startTime + layer.duration;
}

function getAddMenuOption(type: SequenceAddableLayerType): SequenceAddMenuOption {
  switch (type) {
    case 'video':
      return { type, label: 'Video', description: 'Video', icon: Film };
    case 'audio':
      return { type, label: 'Audio', description: 'Audio', icon: Volume2 };
    case 'text':
      return { type, label: 'Text', description: 'Text', icon: Type };
    case 'image':
      return { type, label: 'Image', description: 'Image', icon: ImageIcon };
    case 'spectrum':
      return { type, label: 'Spectrum', description: 'Spectrum', icon: Activity };
  }
}

type MainMediaLayerType = Extract<SequenceAddableLayerType, 'video' | 'image' | 'audio'>;

function getAllowedAddMenuOptions(scopeRole?: ScopeRoleType): SequenceAddMenuOption[] {
  const allowedTypes = new Set(getAllowedStudioLayerTypes(scopeRole));
  return (['video', 'audio', 'text', 'image', 'spectrum'] as const)
    .map((type) => getAddMenuOption(type))
    .filter((option) => allowedTypes.has(option.type));
}

function getMainMediaOptions(): Array<SequenceAddMenuOption & { type: MainMediaLayerType }> {
  return (['video', 'image', 'audio'] as const).map(
    (type) => getAddMenuOption(type) as SequenceAddMenuOption & { type: MainMediaLayerType },
  );
}

function getDefaultImageScale(
  scopeRole: ScopeRoleType | undefined,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  if (scopeRole === 'overlay') {
    const safeCanvasWidth = Math.max(1, canvasWidth);
    const safeCanvasHeight = Math.max(1, canvasHeight);

    return {
      x: OVERLAY_IMAGE_DEFAULT_SIZE.width / safeCanvasWidth,
      y: OVERLAY_IMAGE_DEFAULT_SIZE.height / safeCanvasHeight,
    };
  }

  return { x: 1, y: 1 };
}

function getSequenceAddLabel(scopeRole?: ScopeRoleType): string {
  switch (scopeRole) {
    case 'main':
      return translate('layer.addMainMedia');
    case 'overlay':
      return translate('layer.addOverlay');
    case 'text':
      return translate('layer.addTextSubtitle');
    default:
      return translate('layer.addLayer');
  }
}

function shouldIgnorePanelBackgroundEvent(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.matches('input[type="file"]') ||
    target.closest('.layer-panel-item-container, .scope-add-row') !== null
  );
}

function DropSlotDivider({
  depth,
}: {
  depth: number;
}) {
  return (
    <li
      aria-hidden="true"
      style={{
        listStyle: 'none',
        position: 'relative',
        height: '8px',
        margin: 0,
        paddingLeft: `${12 + depth * 16}px`,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: `${12 + depth * 16}px`,
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          height: '2px',
          borderRadius: '999px',
          background:
            'linear-gradient(90deg, rgba(0, 191, 255, 0), rgba(0, 191, 255, 1), rgba(0, 191, 255, 0))',
          boxShadow: '0 0 12px rgba(0, 191, 255, 0.75)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: `${12 + depth * 16 + 6}px`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '8px',
          height: '8px',
          borderRadius: '999px',
          background: '#00BFFF',
          boxShadow: '0 0 10px rgba(0, 191, 255, 0.75)',
        }}
      />
    </li>
  );
}

function SequenceAddRow({
  depth,
  isOpen,
  scopeRole,
  menuOptions,
  onToggleOpen,
  onAddLayerType,
}: {
  depth: number;
  isOpen: boolean;
  scopeRole?: ScopeRoleType;
  menuOptions?: SequenceAddMenuOption[];
  onToggleOpen: () => void;
  onAddLayerType: (type: SequenceAddableLayerType) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const addLabel = getSequenceAddLabel(scopeRole);
  const addTitle = `${addLabel} - ${translate('layer.addAllowed')}`;
  const resolvedMenuOptions = menuOptions ?? getAllowedAddMenuOptions(scopeRole);
  const isHighlighted = isOpen || isHovered;
  const containerBackgroundColor = isHighlighted
    ? isOpen
      ? 'rgba(0, 191, 255, 0.11)'
      : 'rgba(255, 255, 255, 0.08)'
    : 'transparent';
  const containerBorderLeft = isHighlighted
    ? isOpen
      ? '3px solid rgba(0, 191, 255, 0.55)'
      : '3px solid rgba(255, 255, 255, 0.3)'
    : '3px solid transparent';
  const containerBoxShadow = isOpen ? 'inset 0 0 10px rgba(0, 191, 255, 0.1)' : 'none';

  return (
    <li
      className="layer-panel-item-container layer-panel-item--image scope-add-row"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        padding: '6px 12px',
        paddingLeft: `${12 + depth * 16}px`,
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        backgroundColor: containerBackgroundColor,
        transition: 'all 0.2s ease',
        width: '100%',
        opacity: 1,
        borderLeft: containerBorderLeft,
        cursor: 'pointer',
        boxSizing: 'border-box',
        boxShadow: containerBoxShadow,
      }}
    >
      {depth > 0 && (
        <div
          className="layer-panel-scope-marker"
          style={{
            position: 'absolute',
            left: `${depth * 16}px`,
            top: 0,
            bottom: 0,
            width: '2px',
            borderRadius: '999px',
            backgroundColor: 'rgba(0, 191, 255, 0.3)',
            boxShadow: '0 0 10px rgba(0, 191, 255, 0.18)',
            pointerEvents: 'none',
          }}
        />
      )}

      <button
        type="button"
        className="layer-panel-item-toggle"
        title={addTitle}
        onClick={(e) => {
          e.stopPropagation();
          onToggleOpen();
        }}
        style={{
          width: '24px',
          height: '24px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '8px',
          border: isOpen
            ? '1px solid rgba(0, 191, 255, 0.55)'
            : '1px solid rgba(0, 191, 255, 0.32)',
          background: isOpen
            ? 'linear-gradient(180deg, rgba(0, 191, 255, 0.25), rgba(0, 191, 255, 0.12))'
            : 'linear-gradient(180deg, rgba(0, 191, 255, 0.14), rgba(0, 191, 255, 0.05))',
          color: '#00BFFF',
          boxShadow: isOpen
            ? '0 0 0 1px rgba(0, 191, 255, 0.08), 0 0 12px rgba(0, 191, 255, 0.2)'
            : '0 0 10px rgba(0, 191, 255, 0.08)',
          cursor: 'pointer',
          flex: '0 0 auto',
          marginRight: '8px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Plus size={13} strokeWidth={2.5} />
      </button>

      <button
        type="button"
        className="layer-panel-item-select"
        onClick={(e) => {
          e.stopPropagation();
          onToggleOpen();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          background: 'none',
          border: 'none',
          padding: '4px',
          margin: 0,
          textAlign: 'left',
          cursor: 'pointer',
          flexGrow: 1,
          color: 'inherit',
          font: 'inherit',
          outline: 'none',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div className="layer-panel-item-info" style={{ flexGrow: 1 }}>
          <div
            className="layer-panel-item-name"
            style={{
              fontWeight: 600,
              color: '#EAF6FF',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {addLabel}
          </div>
          <div
            className="layer-panel-item-meta"
            style={{
              fontSize: '10px',
              color: '#888',
              marginTop: '1px',
              opacity: 0.8,
            }}
          >
            {translate('layer.chooseLayerType')}
          </div>
        </div>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            left: `${12 + depth * 16 + 40}px`,
            right: '12px',
            top: 'calc(100% + 2px)',
            zIndex: 30,
            width: 'auto',
            minWidth: 0,
            padding: '10px',
            borderRadius: '14px',
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(16, 16, 20, 0.98)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.max(
              1,
              Math.min(resolvedMenuOptions.length, 3),
            )}, minmax(0, 1fr))`,
            gap: '8px',
          }}
        >
          {resolvedMenuOptions.map(({ type, label, description, icon: Icon }) => (
            <button
              key={type}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddLayerType(type);
              }}
              style={{
                padding: '12px 8px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.03)',
                color: '#EEE',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Icon size={18} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span>{label}</span>
                <span style={{ fontSize: '10px', color: '#8a8a95', fontWeight: 500 }}>
                  {description}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

export function LayerPanel({ onSelectLayer, selectedLayerId, currentTime }: LayerPanelProps) {
  const {
    dispatchIntent,
    width: canvasWidth,
    height: canvasHeight,
    layers,
    layerOrder,
  } = useEngineStore();
  const selectedLayerIds = useStudioStore((s) => s.selectedLayerIds);
  const hoveredLayerId = useStudioStore((s) => s.hoveredLayerId);
  const setHoveredLayer = useStudioStore((s) => s.setHoveredLayer);
  const collapsedScopes = useStudioStore((s) => s.collapsedScopes);
  const openProjectSettings = useStudioStore((s) => s.openProjectSettings);
  const showLayerPanel = useStudioStore((s) => s.showLayerPanel);
  const clearSelection = useStudioStore((s) => s.clearSelection);
  const selectLayers = useStudioStore((s) => s.selectLayers);
  const { tree, visibleDisplayNodes, toggleScope } = useLayerTree();

  // Headless D&D Logic
  const { draggingId, dropIndicator, onDragStart, onDragOver, onDrop, onDragEnd, onDragLeave } =
    useLayerPanelDrag({
      dispatchIntent,
      layers,
      layerOrder,
    });

  const handleRemove = (id: string) => {
    const intents = buildDeleteSelectionIntents([id], engineStore.getManifest());
    if (intents.length === 0) return;

    engineStore.executeAtomicIntentBatch(intents);

    const removedLayerIds = new Set(
      intents.filter((intent) => intent.type === 'REMOVE_LAYER').map((intent) => intent.layerId),
    );
    const nextSelectedLayerIds = selectedLayerIds.filter(
      (selectedId) => !removedLayerIds.has(selectedId),
    );

    if (nextSelectedLayerIds.length === selectedLayerIds.length) return;

    if (nextSelectedLayerIds.length === 0) {
      clearSelection();
    } else {
      selectLayers(nextSelectedLayerIds);
    }
  };

  const handleToggle = (id: string, visible: boolean) => {
    dispatchIntent({ type: 'TOGGLE_VISIBILITY', layerId: id, visible });
  };

  const handleToggleMute = (id: string, muted: boolean) => {
    dispatchIntent({
      type: 'UPDATE_LAYER_PROPS',
      layerId: id,
      patch: { muted },
    } as Parameters<typeof dispatchIntent>[0]);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const activeSequenceIdRef = useRef<string | null>(null);
  const [openSequenceMenuId, setOpenSequenceMenuId] = useState<string | null>(null);

  const renderTreeNodes = (
    nodes: UITreeNode[],
    scopeLocalTime = currentTime,
  ): React.ReactNode[] => {
    const rendered: React.ReactNode[] = [];

    for (const node of nodes) {
      const { layer } = node;
      const isProjectAnchor = layer.isProjectAnchor === true;
      const layerType = getStudioLayerType(layer);
      const isSequenceStart = layerType === 'scope:start';
      const isSequenceEnd = layerType === 'scope:end';
      const displayDepth = Math.max(0, node.depth - 1);
      const isSequenceCollapsed = isSequenceStart ? collapsedScopes.has(layer.id) : false;
      const scopeRole = getScopeRole(layer);
      const isDropTarget = dropIndicator?.targetLayerId === layer.id;
      const childScopeLocalTime = isSequenceStart
        ? scopeLocalTime - layer.startTime
        : scopeLocalTime;

      if (isProjectAnchor && isSequenceStart) {
        if (!isSequenceCollapsed) {
          rendered.push(...renderTreeNodes(node.children, childScopeLocalTime));
        }
        continue;
      }

      if (isSequenceEnd) {
        continue;
      }

      if (!isSequenceStart && !isLayerActiveAtScopeTime(layer, scopeLocalTime)) {
        continue;
      }

      rendered.push(
        <Fragment key={layer.id}>
          {isDropTarget && dropIndicator.position === 'before' && (
            <DropSlotDivider depth={displayDepth} />
          )}
          <LayerPanelItem
            layer={layer}
            depth={displayDepth}
            isDragging={draggingId === layer.id}
            isSelected={selectedLayerIds.includes(layer.id) || layer.id === selectedLayerId}
            isHovered={layer.id === hoveredLayerId}
            onRemove={() => handleRemove(layer.id)}
            onToggle={(visible) => handleToggle(layer.id, visible)}
            onToggleMute={(muted) => handleToggleMute(layer.id, muted)}
            onSelect={() => onSelectLayer(layer.id)}
            onToggleSequence={isSequenceStart ? () => toggleScope(layer.id) : undefined}
            isSequenceCollapsed={isSequenceStart ? isSequenceCollapsed : undefined}
            onDragStart={(e) => onDragStart(e, layer.id)}
            onMouseEnter={() => setHoveredLayer(layer.id)}
            onMouseLeave={() => setHoveredLayer(null)}
            onDragOver={(e) => onDragOver(e, node)}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
          />
          {isDropTarget && dropIndicator.position === 'after' && (
            <DropSlotDivider depth={displayDepth} />
          )}
        </Fragment>,
      );

      if (isSequenceStart && !isSequenceCollapsed) {
        rendered.push(
          ...renderTreeNodes(node.children, childScopeLocalTime),
          <SequenceAddRow
            key={`${layer.id}-add-row`}
            depth={displayDepth + 1}
            scopeRole={scopeRole}
            menuOptions={scopeRole === 'main' ? getMainMediaOptions() : undefined}
            isOpen={openSequenceMenuId === layer.id}
            onToggleOpen={() =>
              setOpenSequenceMenuId((current) => (current === layer.id ? null : layer.id))
            }
            onAddLayerType={(type) => handleAddInSequence(layer.id, type)}
          />,
        );
      }
    }

    return rendered;
  };

  const handlePanelClick = (event: MouseEvent<HTMLDivElement>) => {
    if (shouldIgnorePanelBackgroundEvent(event.target)) {
      return;
    }

    onSelectLayer(null);
    openProjectSettings();
  };

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (shouldIgnorePanelBackgroundEvent(event.target)) {
      return;
    }

    event.preventDefault();
    onSelectLayer(null);
    openProjectSettings();
  };

  const handleAddInSequence = (sequenceId: string, layerType: SequenceAddableLayerType) => {
    if (layerType === 'audio') {
      activeSequenceIdRef.current = sequenceId;
      fileInputRef.current?.click();
      return;
    }
    if (layerType === 'image') {
      activeSequenceIdRef.current = sequenceId;
      imageFileInputRef.current?.click();
      return;
    }
    if (layerType === 'video') {
      activeSequenceIdRef.current = sequenceId;
      videoFileInputRef.current?.click();
      return;
    }

    const scopeStartTime = engineStore.getManifest().layers[sequenceId]?.startTime ?? 0;
    const localStartTime = Math.max(0, currentTime - scopeStartTime);

    switch (layerType) {
      case 'spectrum': {
        const layerId = `${layerType}-${Math.random().toString(36).substring(2, 7)}`;
        const linkedAudioLayer = layers.find((layer) => getStudioLayerType(layer) === 'audio');
        if (!linkedAudioLayer) {
          toast.warning(translate('spectrum.noAudioSource'), {
            message: translate('spectrum.noAudioSourceMessage'),
          });
        }
        const linkedAudioTiming = buildLinkedAudioTimingPatch(linkedAudioLayer);
        dispatchIntent({
          type: 'ADD_LAYER',
          targetScopeId: sequenceId,
          manifest: createSpectrumLayerManifest({
            id: layerId,
            startTime: linkedAudioTiming.startTime ?? localStartTime,
            duration: linkedAudioTiming.duration ?? DEFAULT_NEW_LAYER_DURATION,
            linkedAudioId: linkedAudioLayer?.id ?? null,
          }),
        });
        onSelectLayer(layerId);
        setOpenSequenceMenuId(null);
        break;
      }
      case 'text':
        dispatchIntent({
          type: 'ADD_LAYER',
          targetScopeId: sequenceId,
          manifest: buildCenteredTextLayerManifest({
            id: `${layerType}-${Math.random().toString(36).substring(2, 7)}`,
            text: 'Text',
            name: 'Text Layer',
            startTime: localStartTime,
            duration: DEFAULT_NEW_LAYER_DURATION,
            canvasWidth,
            canvasHeight,
          }),
        });
        setOpenSequenceMenuId(null);
        return;
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const activeSequenceId = activeSequenceIdRef.current;
    if (!file || !activeSequenceId) return;
    if (
      !file.type.startsWith('audio/') &&
      !/\.(mp3|wav|m4a|aac|ogg|flac|aiff?)$/i.test(file.name)
    ) {
      toast.warning(translate('audio.invalidFileType'), {
        message: file.name,
      });
      e.target.value = '';
      activeSequenceIdRef.current = null;
      setOpenSequenceMenuId(null);
      return;
    }

    const audioUrl = URL.createObjectURL(file);
    try {
      const newId = `audio-${Math.random().toString(36).substr(2, 5)}`;
      const duration = resolveMediaLayerDuration(await readAudioDurationFromUrl(audioUrl));
      const sourceUrl = await useProjectAssetsStore.getState().ingestFile(file);
      const scopeStartTime = engineStore.getManifest().layers[activeSequenceId]?.startTime ?? 0;
      const localStartTime = Math.max(0, currentTime - scopeStartTime);

      dispatchIntent({
        type: 'ADD_LAYER',
        targetScopeId: activeSequenceId,
        manifest: createAudioLayerManifest({
          id: newId,
          name: file.name,
          startTime: localStartTime,
          duration,
          sourceUrl,
        }),
      });

      onSelectLayer(newId);
    } catch (error) {
      console.error('[LayerPanel] Failed to add audio layer:', error);
      toast.error(translate('audio.addFailed'), {
        message: error instanceof Error ? error.message : file.name,
      });
    } finally {
      URL.revokeObjectURL(audioUrl);
      e.target.value = '';
      activeSequenceIdRef.current = null;
      setOpenSequenceMenuId(null);
    }
  };

  const handleImageFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const activeSequenceId = activeSequenceIdRef.current;
    if (!file || !activeSequenceId) return;

    if (
      !file.type.startsWith('image/') &&
      !/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(file.name)
    ) {
      toast.warning(translate('assets.invalidFileType'), {
        message: file.name,
      });
      e.target.value = '';
      activeSequenceIdRef.current = null;
      setOpenSequenceMenuId(null);
      return;
    }

    try {
      const newId = `image-${Math.random().toString(36).substr(2, 5)}`;
      const bitmap = await createImageBitmap(file).catch(() => null);
      const sourceWidth = bitmap?.width ?? canvasWidth;
      const sourceHeight = bitmap?.height ?? canvasHeight;

      const sourceUrl = await useProjectAssetsStore.getState().ingestFile(file);

      const scopeStartTime = engineStore.getManifest().layers[activeSequenceId]?.startTime ?? 0;
      const localStartTime = Math.max(0, currentTime - scopeStartTime);

      const imageManifest = createImageLayerManifest({
        id: newId,
        name: file.name,
        startTime: localStartTime,
        duration: DEFAULT_NEW_LAYER_DURATION,
        sourceUrl,
        sourceWidth,
        sourceHeight,
      });

      const scopeRole = getScopeRole(engineStore.getManifest().layers[activeSequenceId]);
      const defaultScale = getDefaultImageScale(scopeRole, canvasWidth, canvasHeight);

      dispatchIntent({
        type: 'ADD_LAYER',
        targetScopeId: activeSequenceId,
        manifest:
          defaultScale.x === 1 && defaultScale.y === 1
            ? imageManifest
            : {
                ...imageManifest,
                transform: {
                  ...(imageManifest.transform ?? {
                    position: { x: 0, y: 0 },
                    scale: { x: 1, y: 1 },
                    rotation: 0,
                  }),
                  scale: defaultScale,
                },
              },
      });

      showLayerPanel();
      onSelectLayer(newId);
    } catch (error) {
      console.error('[LayerPanel] Failed to add image layer:', error);
      toast.error(translate('audio.addFailed'), {
        message: error instanceof Error ? error.message : file.name,
      });
    } finally {
      e.target.value = '';
      activeSequenceIdRef.current = null;
      setOpenSequenceMenuId(null);
    }
  };

  const handleVideoFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const activeSequenceId = activeSequenceIdRef.current;
    if (!file || !activeSequenceId) return;

    if (!isVideoImportCandidate(file.name)) {
      toast.warning(translate('assets.invalidFileType'), {
        message: file.name,
      });
      e.target.value = '';
      activeSequenceIdRef.current = null;
      setOpenSequenceMenuId(null);
      return;
    }

    try {
      const newId = `video-${Math.random().toString(36).substr(2, 5)}`;
      const sourceUrl = await useProjectAssetsStore.getState().ingestFile(file);

      const scopeStartTime = engineStore.getManifest().layers[activeSequenceId]?.startTime ?? 0;
      const localStartTime = Math.max(0, currentTime - scopeStartTime);

      // We get duration from the asset record which was just updated
      const asset = useProjectAssetsStore.getState().assets?.find((a) => a.sourceUrl === sourceUrl);
      const duration = resolveMediaLayerDuration(asset?.durationSeconds);
      const sourceWidth = asset?.width ?? null;
      const sourceHeight = asset?.height ?? null;
      const audioLayerId = `${newId}-audio`;

      engineStore.executeAtomicIntentBatch([
        {
          type: 'ADD_LAYER',
          targetScopeId: activeSequenceId,
          manifest: createVideoLayerManifest({
            id: newId,
            name: file.name,
            startTime: localStartTime,
            duration,
            sourceUrl,
            sourceWidth,
            sourceHeight,
          }),
        },
        {
          type: 'ADD_LAYER',
          targetScopeId: activeSequenceId,
          manifest: createVideoAudioLayerManifest({
            id: audioLayerId,
            name: `${file.name} Audio`,
            startTime: localStartTime,
            duration,
            sourceUrl,
          }),
        },
      ]);

      showLayerPanel();
      onSelectLayer(newId);
    } catch (error) {
      console.error('[LayerPanel] Failed to add video layer:', error);
      toast.error(
        translate(
          isUnsupportedVideoFileError(error) ? 'assets.unsupportedVideo' : 'assets.videoAddFailed',
        ),
        {
          message: error instanceof Error ? error.message : file.name,
        },
      );
    } finally {
      e.target.value = '';
      activeSequenceIdRef.current = null;
      setOpenSequenceMenuId(null);
    }
  };

  return (
    <>
      <div
        className="layer-panel-container"
        id="layer-panel-v2"
        onClick={handlePanelClick}
        onKeyDown={handlePanelKeyDown}
        onDragLeave={onDragLeave}
      >
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept="audio/*"
          onChange={handleFileChange}
        />

        <input
          type="file"
          ref={imageFileInputRef}
          style={{ display: 'none' }}
          accept="image/*"
          onChange={handleImageFileChange}
        />

        <input
          type="file"
          ref={videoFileInputRef}
          style={{ display: 'none' }}
          accept={VIDEO_IMPORT_ACCEPT}
          onChange={handleVideoFileChange}
        />

        <ul className="layer-panel-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {renderTreeNodes(tree)}
          {visibleDisplayNodes.length === 0 && (
            <div
              className="layer-panel-empty"
              style={{
                margin: '12px',
                padding: '16px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(255, 255, 255, 0.03)',
                color: 'rgba(224, 236, 247, 0.78)',
                textAlign: 'center',
                fontSize: '12px',
                fontWeight: 500,
                letterSpacing: '0.01em',
                textShadow: '0 1px 0 rgba(0, 0, 0, 0.35)',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
              }}
            >
              {translate('layer.noLayers')}
            </div>
          )}
        </ul>
      </div>
    </>
  );
}
