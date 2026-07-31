import type { ILayer, IProjectManifest } from '@rendium/engine';
import { getSequenceBounds } from '@rendium/engine';
import { getStudioLayerType } from './canonicalLayer';

export type UITreeNode = {
  layer: ILayer;
  children: UITreeNode[];
  depth: number;
  orderIndex: number;
};

function buildLayerRecord(layers: ILayer[]): Record<string, ILayer> {
  const record: Record<string, ILayer> = {};
  for (const layer of layers) {
    record[layer.id] = layer;
  }
  return record;
}

function buildSequenceManifest(
  layers: ILayer[],
  layerOrder: string[],
): Pick<IProjectManifest, 'layers' | 'layerOrder'> {
  return {
    layers: buildLayerRecord(layers) as unknown as IProjectManifest['layers'],
    layerOrder,
  };
}

export function findSequenceEndIndex(
  layers: ILayer[],
  layerOrder: string[],
  sequenceStartId: string,
): number | undefined {
  return getSequenceBounds({
    manifest: buildSequenceManifest(layers, layerOrder),
    sequenceStartId,
  })?.endIndex;
}

export function buildLayerTree(layers: ILayer[], layerOrder: string[]): UITreeNode[] {
  const layersById = buildLayerRecord(layers);
  const topNodes: UITreeNode[] = [];
  const stack: UITreeNode[][] = [topNodes];

  for (const [orderIndex, layerId] of layerOrder.entries()) {
    const layer = layersById[layerId];
    if (!layer) continue;

    const depth = stack.length - 1;
    const node: UITreeNode = {
      layer,
      children: [],
      depth,
      orderIndex,
    };

    stack[stack.length - 1].push(node);

    if (getStudioLayerType(layer) === 'scope:start') {
      stack.push(node.children);
      continue;
    }

    if (getStudioLayerType(layer) === 'scope:end' && stack.length > 1) {
      stack.pop();
    }
  }

  return topNodes;
}

function flattenTree(
  nodes: UITreeNode[],
  collapsedScopes: Set<string>,
  includeProjectAnchors: boolean,
): UITreeNode[] {
  const flattened: UITreeNode[] = [];

  for (const node of nodes) {
    const isProjectAnchor = node.layer.isProjectAnchor === true;
    const isCollapsedScope =
      getStudioLayerType(node.layer) === 'scope:start' && collapsedScopes.has(node.layer.id);

    if (isProjectAnchor && !includeProjectAnchors) {
      if (getStudioLayerType(node.layer) === 'scope:start' && !isCollapsedScope) {
        flattened.push(...flattenTree(node.children, collapsedScopes, includeProjectAnchors));
      }
      continue;
    }

    flattened.push(node);

    if (getStudioLayerType(node.layer) !== 'scope:start') {
      continue;
    }

    if (isCollapsedScope) {
      const scopeEnd = node.children.find(
        (child) => getStudioLayerType(child.layer) === 'scope:end',
      );
      if (scopeEnd) {
        flattened.push(scopeEnd);
      }
      continue;
    }

    flattened.push(...flattenTree(node.children, collapsedScopes, includeProjectAnchors));
  }

  return flattened;
}

export type LayerTreeResult = {
  tree: UITreeNode[];
  visibleNodes: UITreeNode[];
  visibleDisplayNodes: UITreeNode[];
  visibleLayers: ILayer[];
  visibleContentLayers: ILayer[];
  visibleSequenceStarts: UITreeNode[];
};

export function createLayerTreeResult(
  layers: ILayer[],
  layerOrder: string[],
  collapsedScopes: Set<string>,
): LayerTreeResult {
  const tree = buildLayerTree(layers, layerOrder);
  const visibleNodes = flattenTree(tree, collapsedScopes, true);
  const visibleDisplayNodes = visibleNodes
    .filter(
      (node) =>
        node.layer.isProjectAnchor !== true && getStudioLayerType(node.layer) !== 'scope:end',
    )
    .map((node) => ({
      ...node,
      depth: Math.max(0, node.depth - 1),
    }));
  const visibleLayers = visibleNodes.map((node) => node.layer);
  const visibleContentLayers = visibleNodes
    .filter((node) => !getStudioLayerType(node.layer).startsWith('scope:'))
    .map((node) => node.layer);
  const visibleSequenceStarts = visibleDisplayNodes.filter(
    (node) => getStudioLayerType(node.layer) === 'scope:start',
  );

  return {
    tree,
    visibleNodes,
    visibleDisplayNodes,
    visibleLayers,
    visibleContentLayers,
    visibleSequenceStarts,
  };
}
