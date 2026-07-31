import type { HistoryRecord, ILayer, IProjectManifest, IScene } from '../_contracts';
import { engineStore } from '../store/EngineStore';

/**
 * Interface for the global Rendium Debugger object.
 */
interface IRendiumDebugger {
  scene: () => IScene;
  layers: () => ILayer[];
  manifest: () => IProjectManifest;
  history: () => { undoStack: HistoryRecord[]; redoStack: HistoryRecord[] };
  help: () => void;
}

/**
 * Initializes the console debugger and attaches it to the global window object.
 * Accessible globally as `window.rd`.
 */
export function initConsoleDebugger(): void {
  if (typeof window === 'undefined') return;

  const rd: IRendiumDebugger = {
    /**
     * Prints the current scene object.
     */
    scene: () => {
      const scene = engineStore._internalScene;
      console.log(
        '%c[Rendium] %cCurrent Project Sequence:',
        'color: #a855f7; font-weight: bold; background: #1e1b4b; padding: 2px 4px; border-radius: 4px;',
        'font-weight: bold; color: #f8fafc;',
        scene,
      );
      return scene;
    },

    /**
     * Prints the current layers array in a readable table.
     */
    layers: () => {
      const layers = engineStore._internalScene.layers;
      console.log(
        '%c[Rendium] %cActive Sequence Layers:',
        'color: #a855f7; font-weight: bold; background: #1e1b4b; padding: 2px 4px; border-radius: 4px;',
        'font-weight: bold; color: #f8fafc;',
      );
      console.table(
        layers.map((l: ILayer) => ({
          id: l.id,
          kind: l.kind,
          start: `${l.startTime.toFixed(2)}s`,
          duration: `${l.duration.toFixed(2)}s`,
          visible:
            'appearance' in l
              ? (l as { appearance: { visible: boolean } }).appearance.visible
                ? '✅'
                : '❌'
              : 'N/A',
        })),
      );
      return layers;
    },

    /**
     * Prints the current manifest SSOT.
     */
    manifest: () => {
      const manifest = engineStore.getManifest();
      console.log(
        '%c[Rendium] %cProject Manifest (SSOT):',
        'color: #a855f7; font-weight: bold; background: #1e1b4b; padding: 2px 4px; border-radius: 4px;',
        'font-weight: bold; color: #f8fafc;',
        manifest,
      );
      return manifest;
    },

    /**
     * Prints the undo/redo stacks.
     */
    history: () => {
      const history = engineStore.getHistory();
      console.log(
        '%c[Rendium] %cUndo/Redo History Stacks:',
        'color: #a855f7; font-weight: bold; background: #1e1b4b; padding: 2px 4px; border-radius: 4px;',
        'font-weight: bold; color: #f8fafc;',
        history,
      );
      return history;
    },

    /**
     * Help command.
     */
    help: () => {
      console.log(
        '%c[Rendium Project Sequence Debugger]%c\n' +
          'Use the following commands to inspect the engine state:\n\n' +
          '%crd.manifest()%c   - Returns and logs the current IProjectManifest (SSOT).\n' +
          '%crd.history()%c    - Returns and logs the Undo/Redo patch stacks.\n' +
          '%crd.scene()%c      - Returns and logs the current project sequence.\n' +
          '%crd.layers()%c     - Returns and logs a table of current sequence layers.\n' +
          '%crd.help()%c       - Shows this message.',
        'color: #a855f7; font-weight: bold; font-size: 1.2em;',
        'color: #94a3b8;',
        'color: #38bdf8; font-family: monospace;',
        'color: #94a3b8;',
        'color: #38bdf8; font-family: monospace;',
        'color: #94a3b8;',
        'color: #38bdf8; font-family: monospace;',
        'color: #94a3b8;',
        'color: #38bdf8; font-family: monospace;',
        'color: #94a3b8;',
        'color: #38bdf8; font-family: monospace;',
        'color: #94a3b8;',
      );
    },
  };

  // Attach to global window
  (window as unknown as { rd: IRendiumDebugger }).rd = rd;

  // Welcome message in console
  console.log(
    '%c[Rendium] %cConsole debugging enabled. Type %crd.help()%c to see available commands.',
    'color: #a855f7; font-weight: bold;',
    'color: #94a3b8;',
    'color: #38bdf8; font-style: italic; font-weight: bold;',
    'color: #94a3b8;',
  );
}
