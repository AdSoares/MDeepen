import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');

// Copy codicon assets next to the webview bundle so the .vsix ships them
// without .vscodeignore negation tricks.
function copyCodicons() {
  mkdirSync('dist/webview/codicons', { recursive: true });
  cpSync('node_modules/@vscode/codicons/dist/codicon.css', 'dist/webview/codicons/codicon.css');
  cpSync('node_modules/@vscode/codicons/dist/codicon.ttf', 'dist/webview/codicons/codicon.ttf');
}

const extension = {
  entryPoints: ['src/extension/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  outfile: 'dist/extension.js',
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
  await Promise.all([esbuild.build(extension), esbuild.build(webview)]);
  console.log('esbuild build complete.');
}
