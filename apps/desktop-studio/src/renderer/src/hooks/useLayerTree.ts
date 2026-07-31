import { useMemo } from 'react';
import { useStudioStore } from '../stores/studioStore';
import { createLayerTreeResult } from '../utils/layerTree';
import { useEngineStore } from './useEngineStore';

export function useLayerTree() {
  const { layers, layerOrder } = useEngineStore();
  const collapsedScopes = useStudioStore((state) => state.collapsedScopes);
  const toggleScope = useStudioStore((state) => state.toggleScope);

  const treeResult = useMemo(
    () => createLayerTreeResult(layers, layerOrder, collapsedScopes),
    [collapsedScopes, layerOrder, layers],
  );

  return {
    ...treeResult,
    toggleScope,
    collapsedScopes,
  };
}
