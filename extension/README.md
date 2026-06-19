# Visibabel extension

Chrome extension to capture images, send them to a local Ollama (GLM-OCR) endpoint, and return translated text.

## Source of truth

- TypeScript files in `src/**/*.ts` are the canonical source.
- JavaScript files under `dist/` are runtime artifacts emitted by `npm run build:extension`.
- Re-run `npm run build:extension` after TypeScript changes before loading the unpacked extension.

## API reference

- [`../docs/ENDPOINT_API_REFERENCE.md`](../docs/ENDPOINT_API_REFERENCE.md)

## Features

- Capture visible tab screenshot
- Select region on page
- Right-click image to OCR/translate
- Configurable endpoint, prompt, and settings
- All processing local (no cloud)

## Setup

1. Install [Ollama](https://ollama.com/) and pull the model:
   ```bash
   ollama pull glm-ocr:latest
   ```
2. Start Ollama (see [`../ollama/README.md`](../ollama/README.md)).
3. Install dependencies and build:
   ```bash
   cd extension
   npm install
   npm run build:extension
   ```
4. Load this extension unpacked in Chrome from the `extension/` folder.
5. Set endpoint URL in options (default: `http://localhost:11434/`).
6. Optionally start the GLM-OCR layout service (see [`../glm-ocr/README.md`](../glm-ocr/README.md)).

## Development commands

```bash
npm run build:extension
npm run verify:emit-sync
npm run verify:browser-esm-imports
npm run test:unit
npm run test:e2e:runtime
```

From repository root:

```bash
npm --prefix ./extension run test:unit
```

## Troubleshooting

- If the extension cannot connect, ensure Ollama is running at the configured URL.
- Check the options page for diagnostics and logs.
