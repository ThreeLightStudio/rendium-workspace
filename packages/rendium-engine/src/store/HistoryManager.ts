import type { Patch } from 'immer';
import { applyPatches } from 'immer';
import type { HistoryRecord, IHistoryManager, IProjectManifest } from '../_contracts';

/**
 * Default implementation of IHistoryManager.
 * Manages two stacks (undo/redo) and applies patches using Immer.
 */
export class HistoryManager implements IHistoryManager {
  private _undoStack: HistoryRecord[] = [];
  private _redoStack: HistoryRecord[] = [];
  private _lastPatches: Patch[] | null = null;

  public push(patches: Patch[], inversePatches: Patch[]): void {
    this._undoStack.push({
      patches,
      inversePatches,
      timestamp: Date.now(),
    });
    // Every new mutation invalidates the redo branch.
    this._redoStack = [];
    this._lastPatches = null;
  }

  public undo(manifest: IProjectManifest): IProjectManifest | null {
    const record = this._undoStack.pop();
    if (!record) return null;

    this._redoStack.push(record);
    this._lastPatches = record.inversePatches;
    return applyPatches(manifest, record.inversePatches);
  }

  public redo(manifest: IProjectManifest): IProjectManifest | null {
    const record = this._redoStack.pop();
    if (!record) return null;

    this._undoStack.push(record);
    this._lastPatches = record.patches;
    return applyPatches(manifest, record.patches);
  }

  public getLastPatches(): Patch[] | null {
    return this._lastPatches;
  }

  public clear(): void {
    this._undoStack = [];
    this._redoStack = [];
    this._lastPatches = null;
  }

  public get undoStackSize(): number {
    return this._undoStack.length;
  }

  public get redoStackSize(): number {
    return this._redoStack.length;
  }

  public getHistory(): { undoStack: HistoryRecord[]; redoStack: HistoryRecord[] } {
    return {
      undoStack: [...this._undoStack],
      redoStack: [...this._redoStack],
    };
  }
}
