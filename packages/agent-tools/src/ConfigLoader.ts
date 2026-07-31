import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as yaml from 'js-yaml';
import { mergeWith } from 'lodash-es';
import { type AgentRules, AgentRulesSchema } from './AgentRulesSchema.js';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasStringId(value: unknown): value is { id: string } {
  return isRecord(value) && typeof Reflect.get(value, 'id') === 'string';
}

function isIdKeyedArray(value: readonly unknown[]): value is readonly { id: string }[] {
  return value.length > 0 && value.every(hasStringId);
}

function cloneWithArrayStrategy<T>(value: T): T {
  return mergeWith({}, value, arrayMergeCustomizer) as T;
}

function mergeIdKeyedArray<T extends { id: string }>(
  parent: readonly T[],
  child: readonly T[],
): T[] {
  const mergedById = new Map<string, T>();
  const orderedIds: string[] = [];

  for (const item of parent) {
    mergedById.set(item.id, cloneWithArrayStrategy(item));
    orderedIds.push(item.id);
  }

  for (const item of child) {
    const existing = mergedById.get(item.id);
    if (existing) {
      mergedById.set(
        item.id,
        cloneWithArrayStrategy(mergeWith({}, existing, item, arrayMergeCustomizer) as T),
      );
      continue;
    }

    mergedById.set(item.id, cloneWithArrayStrategy(item));
    orderedIds.push(item.id);
  }

  return orderedIds.map((id) => mergedById.get(id) as T);
}

function arrayMergeCustomizer(objValue: unknown, srcValue: unknown): unknown {
  if (Array.isArray(objValue) && Array.isArray(srcValue)) {
    if (isIdKeyedArray(objValue) || isIdKeyedArray(srcValue)) {
      return mergeIdKeyedArray(
        objValue as readonly { id: string }[],
        srcValue as readonly { id: string }[],
      );
    }

    return [...srcValue];
  }

  return undefined;
}

function deepMergeRules(parent: AgentRules, child: AgentRules): AgentRules {
  return mergeWith({}, parent, child, arrayMergeCustomizer) as AgentRules;
}

function readYamlFile(filePath: string): unknown {
  const raw = readFileSync(filePath, 'utf8');
  return yaml.load(raw);
}

function resolveRulesPath(baseDir: string): string {
  return resolve(baseDir, '.agentrules.yml');
}

function validateKind(
  kind: AgentRules['kind'],
  expected: AgentRules['kind'],
  filePath: string,
): void {
  if (kind !== expected) {
    throw new Error(`Expected ${expected} rules in ${filePath}, but found ${kind}.`);
  }
}

export class ConfigLoader {
  public constructor(
    private readonly workspaceRootDir: string,
    private readonly targetPackageDir: string,
  ) {}

  public load(): AgentRules {
    const rootRulesPath = resolveRulesPath(this.workspaceRootDir);
    const targetRulesPath = resolveRulesPath(this.targetPackageDir);

    const rootRules = this.loadRules(rootRulesPath);
    validateKind(rootRules.kind, 'root', rootRulesPath);

    const targetRules = this.loadRules(targetRulesPath);
    validateKind(targetRules.kind, 'package', targetRulesPath);

    this.assertTargetExtendsRoot(targetRules, rootRulesPath, targetRulesPath);

    const mergedRules = deepMergeRules(rootRules, targetRules);
    return AgentRulesSchema.parse(mergedRules);
  }

  private loadRules(filePath: string): AgentRules {
    const parsed = readYamlFile(filePath);
    return AgentRulesSchema.parse(parsed);
  }

  private assertTargetExtendsRoot(
    targetRules: AgentRules,
    rootRulesPath: string,
    targetRulesPath: string,
  ): void {
    const inheritance = targetRules.inheritance;
    const extendsPath = inheritance?.extends;

    if (!extendsPath) {
      throw new Error(
        `Target rules at ${targetRulesPath} must define inheritance.extends pointing to ${rootRulesPath}.`,
      );
    }

    const resolvedExtendsPath = resolve(this.targetPackageDir, extendsPath);
    if (resolvedExtendsPath !== rootRulesPath) {
      throw new Error(
        `Target rules at ${targetRulesPath} extend ${resolvedExtendsPath}, expected ${rootRulesPath}.`,
      );
    }
  }
}
