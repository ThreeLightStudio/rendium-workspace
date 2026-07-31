import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import * as yaml from 'js-yaml';
import { ConfigLoader } from './ConfigLoader.js';
import { PromptRenderer } from './PromptRenderer.js';

interface CliOptions {
  workspaceRoot: string;
  packageDir: string;
}

type RulesKind = 'root' | 'package';

function printUsage(): void {
  console.log(
    [
      'Usage:',
      '  rendium-agent-tools [--workspace-root <path>] [--package-dir <path>]',
      '',
      'Options:',
      '  -w, --workspace-root  Workspace root containing the root .agentrules.yml',
      '  -p, --package-dir     Target package directory containing the package .agentrules.yml',
      '  -h, --help            Show this help message',
      '',
      'Defaults:',
      '  - package-dir is inferred from the current working directory',
      '  - workspace-root is inferred from the nearest ancestor root rules file',
    ].join('\n'),
  );
}

function resolveStartDir(): string {
  return process.cwd();
}

function resolvePath(input: string, baseDir: string): string {
  return isAbsolute(input) ? input : resolve(baseDir, input);
}

function readRulesKind(dirPath: string): RulesKind | undefined {
  const rulesPath = resolve(dirPath, '.agentrules.yml');
  if (!existsSync(rulesPath)) {
    return undefined;
  }

  const parsed = yaml.load(readFileSync(rulesPath, 'utf8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined;
  }

  const kind = Reflect.get(parsed, 'kind');
  if (kind === 'root' || kind === 'package') {
    return kind;
  }

  return undefined;
}

function findAncestorByKind(
  startDir: string,
  desiredKind: RulesKind,
  stopAt?: string,
): string | undefined {
  const boundary = stopAt ? resolve(stopAt) : undefined;
  let current = resolve(startDir);

  while (true) {
    if (readRulesKind(current) === desiredKind) {
      return current;
    }

    if (boundary && current === boundary) {
      return undefined;
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

function resolvePackageDir(startDir: string, workspaceRoot?: string, packageDir?: string): string {
  if (packageDir) {
    const resolvedPackageDir = resolvePath(packageDir, startDir);
    if (readRulesKind(resolvedPackageDir) !== 'package') {
      throw new Error(
        `Expected package rules in ${resolve(resolvedPackageDir, '.agentrules.yml')}.`,
      );
    }

    return resolvedPackageDir;
  }

  const discoveredPackageDir = findAncestorByKind(startDir, 'package', workspaceRoot);
  if (!discoveredPackageDir) {
    throw new Error(
      `Could not determine a package directory from ${startDir}. Pass --package-dir explicitly.`,
    );
  }

  return discoveredPackageDir;
}

function resolveWorkspaceRoot(
  startDir: string,
  packageDir: string,
  workspaceRoot?: string,
): string {
  if (workspaceRoot) {
    const resolvedWorkspaceRoot = resolvePath(workspaceRoot, startDir);
    if (readRulesKind(resolvedWorkspaceRoot) !== 'root') {
      throw new Error(
        `Expected root rules in ${resolve(resolvedWorkspaceRoot, '.agentrules.yml')}.`,
      );
    }

    return resolvedWorkspaceRoot;
  }

  const discoveredWorkspaceRoot = findAncestorByKind(packageDir, 'root');
  if (!discoveredWorkspaceRoot) {
    throw new Error(
      `Could not determine the workspace root from ${packageDir}. Pass --workspace-root explicitly.`,
    );
  }

  return discoveredWorkspaceRoot;
}

function parseCliOptions(argv: string[]): CliOptions | undefined {
  const parsed = parseArgs({
    args: argv,
    options: {
      'workspace-root': {
        type: 'string',
        short: 'w',
      },
      'package-dir': {
        type: 'string',
        short: 'p',
      },
      help: {
        type: 'boolean',
        short: 'h',
      },
    },
  });

  if (parsed.values.help === true) {
    printUsage();
    return undefined;
  }

  const startDir = resolveStartDir();
  const workspaceRootArg = parsed.values['workspace-root'];
  const packageDirArg = parsed.values['package-dir'];
  const packageDir = resolvePackageDir(
    startDir,
    typeof workspaceRootArg === 'string' ? resolvePath(workspaceRootArg, startDir) : undefined,
    typeof packageDirArg === 'string' ? packageDirArg : undefined,
  );
  const workspaceRoot = resolveWorkspaceRoot(
    startDir,
    packageDir,
    typeof workspaceRootArg === 'string' ? workspaceRootArg : undefined,
  );

  return { workspaceRoot, packageDir };
}

export function runCli(argv: string[] = process.argv.slice(2)): number {
  try {
    const options = parseCliOptions(argv);
    if (!options) return 0;

    const loader = new ConfigLoader(options.workspaceRoot, options.packageDir);
    const rules = loader.load();
    const rendered = new PromptRenderer().render(rules);

    process.stdout.write(`${rendered}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    return 1;
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entrypoint) {
  process.exitCode = runCli();
}
