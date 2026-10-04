import { describe, it, expect } from 'vitest';
import { packageRootOf, licenseFilesIn, renderNotices } from './third-party-notices.mjs';

describe('packageRootOf', () => {
  it('finds the package a bundled file came from', () => {
    expect(packageRootOf('node_modules/mermaid/dist/mermaid.core.mjs')).toBe('node_modules/mermaid');
  });

  it('keeps the scope of a scoped package', () => {
    expect(packageRootOf('node_modules/@anthropic-ai/sdk/client.mjs')).toBe('node_modules/@anthropic-ai/sdk');
  });

  it('picks the innermost package when one is nested in another', () => {
    expect(packageRootOf('node_modules/a/node_modules/@s/b/index.js')).toBe('node_modules/a/node_modules/@s/b');
  });

  it('accepts Windows separators', () => {
    expect(packageRootOf('node_modules\\preact\\dist\\preact.mjs')).toBe('node_modules/preact');
  });

  it('ignores the project\'s own sources', () => {
    expect(packageRootOf('src/webview/main.tsx')).toBeUndefined();
  });
});

describe('licenseFilesIn', () => {
  it('keeps license, licence, copying and notice files, in a stable order', () => {
    expect(licenseFilesIn(['package.json', 'NOTICE', 'LICENSE-CODE', 'README.md', 'LICENSE', 'licence.txt', 'COPYING']))
      .toEqual(['COPYING', 'LICENSE', 'LICENSE-CODE', 'NOTICE', 'licence.txt']);
  });
});

describe('renderNotices', () => {
  const pkg = (name, extra = {}) => ({ name, version: '1.0.0', license: 'MIT', files: [{ name: 'LICENSE', text: `${name} license text` }], ...extra });

  it('lists each package once, sorted by name, with version, license and text', () => {
    const out = renderNotices([pkg('zeta'), pkg('alpha'), pkg('zeta')]);
    expect(out.indexOf('## alpha@1.0.0')).toBeLessThan(out.indexOf('## zeta@1.0.0'));
    expect(out.match(/## zeta@1\.0\.0/g)).toHaveLength(1);
    expect(out).toContain('License: MIT');
    expect(out).toContain('alpha license text');
  });

  it('says so when a package ships no license file, rather than leaving a silent gap', () => {
    const out = renderNotices([pkg('bare', { files: [] })]);
    expect(out).toContain('No license file is shipped with this package.');
  });

  it('is deterministic, so CI can check it is up to date', () => {
    const a = renderNotices([pkg('b'), pkg('a')]);
    const b = renderNotices([pkg('a'), pkg('b')]);
    expect(a).toBe(b);
  });
});
