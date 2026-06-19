import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const srcRoot = path.join(root, 'src');
const distRoot = path.join(root, 'dist');
const targetDirs = ['background', 'options', 'popup', 'shared', 'content'];

function walk(dirPath) {
  const entries = readdirSync(dirPath);
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

const srcJsFiles = [];
const tsFiles = [];
const distJsFiles = [];

function isTestFile(filePath) {
  return filePath.includes(`${path.sep}__tests__${path.sep}`);
}

for (const dirName of targetDirs) {
  const srcDirPath = path.join(srcRoot, dirName);
  if (!existsSync(srcDirPath)) {
    continue;
  }

  for (const filePath of walk(srcDirPath)) {
    if (filePath.endsWith('.js')) {
      srcJsFiles.push(filePath);
    }
    if (filePath.endsWith('.ts') && !isTestFile(filePath)) {
      tsFiles.push(filePath);
    }
  }

  const distDirPath = path.join(distRoot, dirName);
  if (!existsSync(distDirPath)) {
    continue;
  }

  for (const filePath of walk(distDirPath)) {
    if (filePath.endsWith('.js')) {
      distJsFiles.push(filePath);
    }
  }
}

const runtimeJsInSrc = srcJsFiles.map((filePath) => path.relative(root, filePath));

const missingDistJs = [];
for (const tsPath of tsFiles) {
  const relativeTsPath = path.relative(srcRoot, tsPath);
  const jsPath = path.join(distRoot, relativeTsPath).replace(/\.ts$/, '.js');
  if (!existsSync(jsPath)) {
    missingDistJs.push(path.relative(root, jsPath));
  }
}

const tsRelativeSet = new Set(
  tsFiles.map((filePath) => path.relative(srcRoot, filePath).replace(/\.ts$/, '.js')),
);

const orphanDistJs = distJsFiles
  .map((filePath) => path.relative(distRoot, filePath))
  .filter((relativeJsPath) => !tsRelativeSet.has(relativeJsPath));

if (runtimeJsInSrc.length || missingDistJs.length || orphanDistJs.length) {
  if (runtimeJsInSrc.length) {
    console.error('Runtime JavaScript files still present in src (remove these and rely on dist emit):');
    for (const file of runtimeJsInSrc) {
      console.error(`- ${file}`);
    }
  }

  if (missingDistJs.length) {
    console.error('Missing emitted JS in dist for TypeScript runtime files:');
    for (const file of missingDistJs) {
      console.error(`- ${file}`);
    }
  }

  if (orphanDistJs.length) {
    console.error('Orphan dist JS without matching src TypeScript file:');
    for (const file of orphanDistJs) {
      console.error(`- ${file}`);
    }
  }

  process.exit(1);
}

console.log('TypeScript ground-truth check passed: src has TS-only runtime and dist JS matches it.');
