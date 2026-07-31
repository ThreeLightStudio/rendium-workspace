import type { IProjectManifest } from '@rendium/engine';
import { normalizeProjectManifest } from '@rendium/engine';

type ProjectManifestInput = Partial<IProjectManifest> &
  Pick<IProjectManifest, 'layers' | 'layerOrder'>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isProjectManifestInput(value: unknown): value is ProjectManifestInput {
  return isPlainObject(value) && isPlainObject(value.layers) && Array.isArray(value.layerOrder);
}

export const fileIO = {
  /**
   * Reads and validates a project file.
   */
  importProject: (file: File): Promise<IProjectManifest> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result;
          if (typeof content !== 'string') {
            throw new Error('Invalid project file: Expected text content.');
          }

          const parsed: unknown = JSON.parse(content);

          if (!isProjectManifestInput(parsed)) {
            throw new Error('Invalid project file: Missing required structural fields.');
          }

          resolve(normalizeProjectManifest(parsed));
        } catch (err: unknown) {
          reject(
            new Error(
              `Failed to import project: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsText(file);
    });
  },
};
