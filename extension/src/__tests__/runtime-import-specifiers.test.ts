import fs from 'node:fs';
import path from 'node:path';

const runtimeDirs = ['background', 'content', 'options', 'popup', 'shared'];
const srcRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(__dirname, '../..');

function walkFiles(dirPath: string): string[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function collectRelativeSpecifiers(sourceText: string): string[] {
  const specifiers: string[] = [];
  const fromRegex = /\bfrom\s+['\"](\.{1,2}\/[^'\"]+)['\"]/g;
  const dynamicImportRegex = /\bimport\s*\(\s*['\"](\.{1,2}\/[^'\"]+)['\"]\s*\)/g;

  for (const match of sourceText.matchAll(fromRegex)) {
    specifiers.push(match[1]);
  }

  for (const match of sourceText.matchAll(dynamicImportRegex)) {
    specifiers.push(match[1]);
  }

  return specifiers;
}

describe('Runtime TS import specifiers', () => {
  test('all relative imports use explicit file extensions', () => {
    const violations: string[] = [];

    for (const runtimeDir of runtimeDirs) {
      const runtimeDirPath = path.join(srcRoot, runtimeDir);

      if (!fs.existsSync(runtimeDirPath)) {
        continue;
      }

      const files = walkFiles(runtimeDirPath)
        .filter((filePath) => filePath.endsWith('.ts'))
        .filter((filePath) => !filePath.includes(`${path.sep}__tests__${path.sep}`));

      for (const filePath of files) {
        const sourceText = fs.readFileSync(filePath, 'utf8');
        const relativeSpecifiers = collectRelativeSpecifiers(sourceText);

        for (const specifier of relativeSpecifiers) {
          if (!path.extname(specifier)) {
            violations.push(`${path.relative(projectRoot, filePath)} -> ${specifier}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
