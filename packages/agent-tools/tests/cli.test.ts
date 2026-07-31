import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/index';

const repoRootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../');
const rootRulesPath = join(repoRootDir, '.agentrules.yml');
const engineRulesPath = join(repoRootDir, 'packages', 'rendium-engine', '.agentrules.yml');

function addResidentRoleFixture(rules: string): string {
  return rules.replace(
    '\nconventions:',
    [
      '',
      'resident_roles:',
      '  - id: storybook-product-owner',
      '    label: Storybook Product Owner',
      '    responsibility: Keep Storybook states aligned with user-facing product expectations.',
      '    applies_to:',
      '      - Storybook stories',
      '      - renderer UI states',
      '    operating_principle: Validate visible states before expanding implementation scope.',
      '',
      'conventions:',
    ].join('\n'),
  );
}

async function createWorkspaceFixture(): Promise<{
  workspaceRootDir: string;
  packageDir: string;
  nestedDir: string;
}> {
  const workspaceRootDir = await mkdtemp(join(tmpdir(), 'agent-tools-cli-'));
  const packageDir = join(workspaceRootDir, 'packages', 'demo-package');
  const nestedDir = join(packageDir, 'src', 'nested');

  await mkdir(nestedDir, { recursive: true });
  await writeFile(join(workspaceRootDir, '.agentrules.yml'), readFileSync(rootRulesPath, 'utf8'));
  await writeFile(
    join(packageDir, '.agentrules.yml'),
    addResidentRoleFixture(readFileSync(engineRulesPath, 'utf8')),
  );

  return { workspaceRootDir, packageDir, nestedDir };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runCli', () => {
  it('infers the current package from cwd', async () => {
    const { nestedDir } = await createWorkspaceFixture();
    vi.spyOn(process, 'cwd').mockReturnValue(nestedDir);

    let output = '';
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk) => {
      output += String(chunk);
      return true;
    }) as never);

    expect(runCli([])).toBe(0);
    expect(output).toContain('### Context first (`context-first`)');
    expect(output).toContain('### No UI deps (`no-ui-deps`)');
    expect(output).toContain('## Resident Roles');
    expect(output).toContain('### Storybook Product Owner (`storybook-product-owner`)');
    expect(output).toContain('## Required Reading');
    expect(output).toContain('Engine onboarding index (./_docs/onboarding/README.md)');
    expect(output).toContain('### 작업-검증 (`workspace-verify`)');
    expect(output).toContain('### 편집-동기화 (`edit-sync`)');

    stdoutSpy.mockRestore();
  });

  it('accepts an explicit package-dir override', async () => {
    const { workspaceRootDir, packageDir } = await createWorkspaceFixture();
    vi.spyOn(process, 'cwd').mockReturnValue(workspaceRootDir);

    let output = '';
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk) => {
      output += String(chunk);
      return true;
    }) as never);

    expect(runCli(['--workspace-root', workspaceRootDir, '--package-dir', packageDir])).toBe(0);
    expect(output).toContain('### Context first (`context-first`)');
    expect(output).toContain('### No UI deps (`no-ui-deps`)');
    expect(output).toContain('Storybook Product Owner');
    expect(output).toContain('Engine README (./README.md)');
    expect(output).toContain('Root rules still apply: true');

    stdoutSpy.mockRestore();
  });

  it('fails with a clear error when no package directory can be inferred', async () => {
    const { workspaceRootDir } = await createWorkspaceFixture();
    vi.spyOn(process, 'cwd').mockReturnValue(workspaceRootDir);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(runCli([])).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Could not determine a package directory'),
    );
  });
});
