import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distRoot = path.join(root, 'dist');
const targetDirs = ['background', 'content', 'options', 'popup', 'shared'];

const importRegex = /\bfrom\s+['\"](\.{1,2}\/[^'\"]+)['\"]|\bimport\s*\(\s*['\"](\.{1,2}\/[^'\"]+)['\"]\s*\)/g;

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

    if (fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

const violations = [];

for (const dirName of targetDirs) {
  const distDirPath = path.join(distRoot, dirName);

  if (!existsSync(distDirPath)) {
    continue;
  }

  const jsFiles = walk(distDirPath);

  for (const jsFilePath of jsFiles) {
    const source = readFileSync(jsFilePath, 'utf8');

    for (const match of source.matchAll(importRegex)) {
      const specifier = match[1] ?? match[2];
      const absoluteBase = path.resolve(path.dirname(jsFilePath), specifier);
      const extension = path.extname(specifier);

      if (!extension) {
        violations.push(`${path.relative(root, jsFilePath)} -> extensionless specifier ${specifier}`);
        continue;
      }

      if (!existsSync(absoluteBase)) {
        violations.push(`${path.relative(root, jsFilePath)} -> missing target ${specifier}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Browser ESM import verification failed:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Browser ESM import verification passed: dist imports are explicit and resolvable.');
