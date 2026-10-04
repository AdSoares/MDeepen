import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THIRD_PARTY_NOTICES.md, built from what esbuild actually bundled. Bundling strips each
 * dependency's license file from the output, while MIT, BSD, Apache and CC-BY all require the
 * notice to travel with the distribution — so the list is derived from the build's own metafile
 * rather than from package.json, which would miss transitive code and include code that is not
 * shipped.
 */

/** The package directory a bundled input file belongs to, or undefined for the project's own. */
export function packageRootOf(inputPath) {
  const parts = inputPath.replace(/\\/g, '/').split('/');
  const at = parts.lastIndexOf('node_modules');
  if (at < 0 || at + 1 >= parts.length) return undefined;
  const scoped = parts[at + 1].startsWith('@');
  return parts.slice(0, at + (scoped ? 3 : 2)).join('/');
}

/** The files in a package directory that carry its license or notices. */
export function licenseFilesIn(fileNames) {
  return fileNames.filter((f) => /^(licen[cs]e|copying|notice)/i.test(f)).sort();
}

/** Reads one package directory into what renderNotices needs. */
export function readPackage(root) {
  const meta = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const files = licenseFilesIn(readdirSync(root)).map((name) => ({ name, text: readFileSync(join(root, name), 'utf8').trim() }));
  return { name: meta.name, version: meta.version, license: meta.license ?? 'UNKNOWN', files };
}

export function renderNotices(packages) {
  const unique = new Map();
  for (const p of packages) unique.set(`${p.name}@${p.version}`, p);
  const sorted = [...unique.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.version < b.version ? -1 : 1));

  const lines = [
    '# Third-party notices',
    '',
    'MDeepen bundles the following third-party software into its `.vsix`. This file is generated',
    'by `npm run build` from what the bundler actually included; do not edit it by hand.',
    '',
  ];
  for (const p of sorted) {
    lines.push(`## ${p.name}@${p.version}`, '', `License: ${p.license}`, '');
    if (p.files.length === 0) {
      lines.push('No license file is shipped with this package.', '');
      continue;
    }
    for (const f of p.files) lines.push('```text', f.text, '```', '');
  }
  return lines.join('\n');
}
