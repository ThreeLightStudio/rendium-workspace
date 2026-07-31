#!/usr/bin/env node

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseArgs } = require('node:util');

const ROOT_DIR = path.resolve(__dirname, '..');
const AGENT_TOOLS_CLI = path.join(ROOT_DIR, 'packages', 'agent-tools', 'dist', 'cli.js');

function printUsage() {
  console.log(
    [
      'Usage:',
      '  pnpm agent -- [--workspace-root <path>] [--package-dir <path>]',
      '',
      'Options:',
      '  -w, --workspace-root  Workspace root containing the root .agentrules.yml',
      '  -p, --package-dir     Target package directory containing the package .agentrules.yml',
      '  -h, --help            Show this help message',
      '',
      'Defaults:',
      '  - workspace-root defaults to the repository root',
      '  - package-dir is inferred from INIT_CWD or the current working directory',
    ].join('\n'),
  );
}

function resolveBaseDir() {
  return process.env.INIT_CWD?.trim() || process.cwd();
}

function resolvePath(input, baseDir) {
  return path.isAbsolute(input) ? input : path.resolve(baseDir, input);
}

function normalizeArgv(argv) {
  if (argv[0] === '--') {
    return argv.slice(1);
  }

  return argv;
}

function parseWrapperOptions(argv) {
  const parsed = parseArgs({
    args: normalizeArgv(argv),
    options: {
      help: {
        type: 'boolean',
        short: 'h',
      },
      'workspace-root': {
        type: 'string',
        short: 'w',
      },
      'package-dir': {
        type: 'string',
        short: 'p',
      },
    },
  });

  if (parsed.values.help === true) {
    return { help: true };
  }

  return {
    help: false,
    workspaceRoot:
      typeof parsed.values['workspace-root'] === 'string' ? parsed.values['workspace-root'] : null,
    packageDir:
      typeof parsed.values['package-dir'] === 'string' ? parsed.values['package-dir'] : null,
  };
}

function buildAgentTools() {
  const result = spawnSync('pnpm', ['--filter', '@rendium/agent-tools', 'build'], {
    cwd: ROOT_DIR,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    return typeof result.status === 'number' ? result.status : 1;
  }

  return 0;
}

function runCli(argv) {
  let options;

  try {
    options = parseWrapperOptions(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    printUsage();
    return 1;
  }

  if (options.help) {
    printUsage();
    return 0;
  }

  const baseDir = resolveBaseDir();
  if (!options.packageDir && path.resolve(baseDir) === ROOT_DIR) {
    console.error(
      "Could not determine a package directory from the repository root. This wrapper needs a concrete package so it can load that package's .agentrules.yml. Run pnpm agent from inside a package directory, or pass --package-dir explicitly (for example: --package-dir packages/rendium-engine).",
    );
    return 1;
  }

  const cliArgs = [];

  const workspaceRoot = options.workspaceRoot
    ? resolvePath(options.workspaceRoot, baseDir)
    : ROOT_DIR;
  cliArgs.push('--workspace-root', workspaceRoot);

  if (options.packageDir) {
    cliArgs.push('--package-dir', resolvePath(options.packageDir, baseDir));
  }

  const buildExitCode = buildAgentTools();
  if (buildExitCode !== 0) {
    return buildExitCode;
  }

  const cliResult = spawnSync(process.execPath, [AGENT_TOOLS_CLI, ...cliArgs], {
    cwd: baseDir,
    env: process.env,
    stdio: 'inherit',
  });

  if (cliResult.error) {
    console.error(cliResult.error.message);
    return 1;
  }

  return typeof cliResult.status === 'number' ? cliResult.status : 1;
}

if (require.main === module) {
  process.exitCode = runCli(process.argv.slice(2));
}
