import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { ConfigLoader, PromptRenderer } from '../src/index';

const repoRootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../');
const enginePackageDir = join(repoRootDir, 'packages', 'rendium-engine');
const engineRulesPath = join(enginePackageDir, '.agentrules.yml');
const studioPackageDir = join(repoRootDir, 'apps', 'desktop-studio');

async function createInvalidPackageFixture(
  replacement: string,
): Promise<{ targetPackageDir: string }> {
  const workspaceRootDir = await mkdtemp(join(tmpdir(), 'agent-tools-workspace-'));
  const targetPackageDir = join(workspaceRootDir, 'packages', 'broken-package');

  await mkdir(targetPackageDir, { recursive: true });

  const original = readFileSync(engineRulesPath, 'utf8');
  const invalidYaml = original.replace(
    '      - key: changed_mutator_path\n        type: string',
    replacement,
  );

  await writeFile(join(targetPackageDir, '.agentrules.yml'), invalidYaml, 'utf8');

  return { targetPackageDir };
}

describe('ConfigLoader', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('merges the real workspace root with the engine package rules', () => {
    const loader = new ConfigLoader(repoRootDir, enginePackageDir);

    const mergedRules = loader.load();

    expect(mergedRules.kind).toBe('package');
    expect(mergedRules.metadata.name).toBe('@rendium/engine');
    expect(mergedRules.metadata.description).toBe(
      'Agent rules for the WebGPU engine bounded context.',
    );
    expect(mergedRules.bounded_context?.name).toBe('rendium-engine');
    expect(mergedRules.bounded_context?.in_scope).toEqual([
      'src/_contracts',
      'src/core',
      'src/store',
      'src/timeline',
      'src/layers',
      'src/_utils',
    ]);
    expect(mergedRules.principles?.map((item) => item.id)).toEqual([
      'cqrs',
      'flat-structure',
      'immutability',
      'uncertainty-honesty',
      'no-hallucination',
      'flat-architecture',
    ]);
    expect(mergedRules.principles?.find((item) => item.id === 'immutability')?.enforcement).toBe(
      'Use patch-aware transforms, not ad hoc object mutation, when changing persisted engine state.',
    );
    expect(mergedRules.conventions?.map((item) => item.id)).toEqual([
      'context-first',
      'docs-before-edit',
      'smallest-viable-change',
      'ask-when-ambiguous',
      'no-ui-deps',
      'state-changes-through-engine-store',
      'patch-aware-change',
    ]);
    expect(mergedRules.required_reading?.map((item) => item.id)).toEqual([
      'engine-readme',
      'engine-onboarding-index',
      'engine-core-layer-onboarding',
      'engine-visual-provider-onboarding',
    ]);
    expect(mergedRules.sops.map((item) => item.id)).toEqual([
      'classify-task',
      'workspace-verify',
      'edit-sync',
      'ui-verification',
    ]);
    expect(mergedRules.sops[0]?.outputs).toEqual([
      { key: 'owning_context', type: 'string' },
      { key: 'impacted_paths', type: 'array[string]' },
      { key: 'verification_plan', type: 'markdown_list' },
    ]);
    expect(mergedRules.override_policy?.allow_child_specialization).toBe(true);
    expect(mergedRules.override_policy?.do_not_repeat_child_conventions).toBe(true);
    expect(mergedRules.override_policy?.root_is_authoritative_for).toEqual([
      'workspace-wide policy',
      'cross-package verification',
      'generic agent behavior',
    ]);
    expect(mergedRules.override_policy?.root_rules_still_apply).toBe(true);
    expect(mergedRules.override_policy?.package_must_not).toEqual([
      'add UI/runtime dependencies',
      'restate workspace policy unless overriding it',
    ]);

    const rendered = new PromptRenderer().render(mergedRules);
    expect(rendered).toContain('Agent rules for the WebGPU engine bounded context.');
    expect(rendered).toContain('### Flat architecture (`flat-architecture`)');
    expect(rendered).toContain('## Required Reading');
    expect(rendered).toContain(
      'Core layer onboarding (./_docs/onboarding/core-layer-onboarding.md)',
    );
    expect(rendered).toContain('### UI-검증-위임 (`ui-verification`)');
    expect(rendered).toContain('Root rules still apply: true');
    expect(rendered).toContain('Package must not:');
  });

  it('renders resident roles from the desktop-studio package rules', () => {
    const loader = new ConfigLoader(repoRootDir, studioPackageDir);

    const mergedRules = loader.load();

    expect(mergedRules.resident_roles?.map((item) => item.id)).toEqual([
      'ux-design-lead',
      'product-manager',
    ]);
    expect(mergedRules.resident_roles?.[0]?.label).toBe('UX Design Lead');
    expect(mergedRules.resident_roles?.[1]?.label).toBe('Product Manager');
    expect(mergedRules.conventions?.map((item) => item.id)).toContain('storybook-onboarding');

    const rendered = new PromptRenderer().render(mergedRules);
    expect(rendered).toContain('## Resident Roles');
    expect(rendered).toContain('### UX Design Lead (`ux-design-lead`)');
    expect(rendered).toContain('### Product Manager (`product-manager`)');
    expect(rendered).toContain('Storybook onboarding');
    expect(rendered).toContain('README Storybook guidance and nearby stories');
  });

  it.each([
    {
      title: 'missing output key',
      replacement: '      - type: string',
    },
    {
      title: 'missing output type',
      replacement: '      - key: changed_mutator_path',
    },
  ])('throws a ZodError when $title', async ({ replacement }) => {
    const { targetPackageDir } = await createInvalidPackageFixture(replacement);
    const loader = new ConfigLoader(repoRootDir, targetPackageDir);

    expect(() => loader.load()).toThrowError(ZodError);
  });
});
