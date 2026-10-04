import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { packageRootOf, readPackage, renderNotices } from './scripts/third-party-notices.mjs';

const watch = process.argv.includes('--watch');

// Start from an empty dist. Chunk names carry a content hash, so every build that changes a chunk
// leaves the old one behind, and vsce packages whatever dist holds.
rmSync('dist', { recursive: true, force: true });

// Copy codicon assets next to the webview bundle so the .vsix ships them
// without .vscodeignore negation tricks.
function copyCodicons() {
  mkdirSync('dist/webview/codicons', { recursive: true });
  cpSync('node_modules/@vscode/codicons/dist/codicon.css', 'dist/webview/codicons/codicon.css');
  cpSync('node_modules/@vscode/codicons/dist/codicon.ttf', 'dist/webview/codicons/codicon.ttf');
}

// Every package the bundles pulled code from, plus the codicons copied beside them as files.
function writeNotices(results) {
  const roots = new Set(['node_modules/@vscode/codicons']);
  for (const r of results) {
    for (const input of Object.keys(r.metafile.inputs)) {
      const root = packageRootOf(input);
      if (root) roots.add(root);
    }
  }
  writeFileSync('THIRD_PARTY_NOTICES.md', renderNotices([...roots].map(readPackage)));
}

const extension = {
  entryPoints: ['src/extension/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  outfile: 'dist/extension.js',
  metafile: true,
  sourcemap: true,
  target: 'node18',
};

// ESM + splitting so dynamic import() of highlight.js/mermaid become real
// lazy chunks (esbuild only code-splits with format 'esm'). The webview
// loads main.js via <script type="module">.
const webview = {
  entryPoints: ['src/webview/main.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  splitting: true,
  outdir: 'dist/webview',
  metafile: true,
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]',
  sourcemap: true,
  target: 'es2020',
  loader: { '.css': 'text' },
  jsx: 'automatic',
  jsxImportSource: 'preact',
};

if (watch) {
  copyCodicons();
  const c1 = await esbuild.context(extension);
  const c2 = await esbuild.context(webview);
  await Promise.all([c1.watch(), c2.watch()]);
  console.log('esbuild watching…');
} else {
  copyCodicons();
  const results = await Promise.all([esbuild.build(extension), esbuild.build(webview)]);
  writeNotices(results);
  console.log('esbuild build complete.');
}
