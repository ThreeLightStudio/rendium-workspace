#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const RENDERER_ROOT = path.join(ROOT, 'apps/desktop-studio/src/renderer/src');
const args = process.argv.slice(2);
const checkAll = args.includes('--all');

function normalizeFilePath(filePath) {
  return filePath.split(path.sep).join(path.posix.sep);
}

function isSupportedFile(filePath) {
  return /\.(tsx|jsx)$/i.test(filePath);
}

function isInRendererScope(filePath) {
  const relative = normalizeFilePath(path.relative(ROOT, filePath));
  return relative.startsWith('apps/desktop-studio/src/renderer/src/');
}

function getAllFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(entryPath));
      continue;
    }

    if (entry.isFile() && isSupportedFile(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}

function getStagedFiles() {
  const output = execFileSync(
    'git',
    ['-C', ROOT, 'diff', '--cached', '--name-only', '--diff-filter=ACMR'],
    { encoding: 'utf8' },
  );

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((relativePath) => path.join(ROOT, relativePath));
}

function isIntrinsicJsxElement(node) {
  return ts.isIdentifier(node.tagName) && /^[a-z]/.test(node.tagName.text);
}

function hasDataFAttribute(node) {
  return node.attributes.properties.some(
    (attribute) => ts.isJsxAttribute(attribute) && attribute.name.text === 'data-f',
  );
}

function findViolations(filePath) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  if (!sourceText.includes('data-f') && !sourceText.includes('data-testid')) {
    return [];
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const violations = [];

  function report(node, message) {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push({
      column: position.character + 1,
      line: position.line + 1,
      message,
    });
  }

  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (isIntrinsicJsxElement(node)) {
        const hasDataF = hasDataFAttribute(node);

        for (const attribute of node.attributes.properties) {
          if (ts.isJsxAttribute(attribute) && attribute.name.text === 'data-testid') {
            report(attribute.name, 'Use `data-f` instead of `data-testid`.');
          }
        }

        if (!hasDataF) {
          report(node.tagName, 'Add a `data-f` attribute to this intrinsic element.');
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return violations;
}

function main() {
  const targetFiles = checkAll
    ? getAllFiles(RENDERER_ROOT)
    : getStagedFiles().filter(
        (filePath) => isInRendererScope(filePath) && isSupportedFile(filePath),
      );

  const uniqueFiles = [...new Set(targetFiles)].filter((filePath) => fs.existsSync(filePath));
  const findings = [];

  for (const filePath of uniqueFiles) {
    const violations = findViolations(filePath);
    for (const violation of violations) {
      findings.push({ filePath, ...violation });
    }
  }

  findings.sort((left, right) => {
    if (left.filePath !== right.filePath) {
      return left.filePath.localeCompare(right.filePath);
    }

    if (left.line !== right.line) {
      return left.line - right.line;
    }

    return left.column - right.column;
  });

  if (findings.length === 0) {
    return;
  }

  for (const finding of findings) {
    const relativePath = path.relative(ROOT, finding.filePath);
    console.error(`${relativePath}:${finding.line}:${finding.column} ${finding.message}`);
  }

  console.error(
    `\nFound ${findings.length} data-f issue(s) in ${new Set(findings.map((item) => item.filePath)).size} file(s).`,
  );
  process.exitCode = 1;
}

main();
