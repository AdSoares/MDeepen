import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { sectionize } from './parser/sectionize';
import { classifyLink, reconcileIndex } from './linkAndReconcile';
import { DocStateStore, UiStateStore } from './state/positionStore';
import { remapReadIds } from './readState';
import type { Page } from '../shared/types';
import type { HostToWebview, WebviewToHost } from '../shared/messages';
import { isWebviewToHost } from '../shared/messages';

const DEFAULT_LEVEL = 2;

export class ReaderPanel {
  private static readonly panels = new Map<string, ReaderPanel>();

  private level = DEFAULT_LEVEL;
  private pages: Page[] = [];
  private activeIndex = 0;
  private readIds: string[] = [];
  private readonly disposables: vscode.Disposable[] = [];
  private disposed = false;
  private queue: Promise<void> = Promise.resolve();

  static open(context: vscode.ExtensionContext, uri: vscode.Uri, docStore: DocStateStore, uiStore: UiStateStore): void {
    const key = uri.toString();
    const existing = ReaderPanel.panels.get(key);
    if (existing) {
      existing.panel.reveal();
      return;
    }
    ReaderPanel.panels.set(key, new ReaderPanel(context, uri, docStore, uiStore));
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly uri: vscode.Uri,
    private readonly docStore: DocStateStore,
    private readonly uiStore: UiStateStore,
    private readonly panel = vscode.window.createWebviewPanel(
      'mdeepenReader',
      `MDeepen · ${uri.path.split('/').pop()}`,
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    ),
  ) {
    this.panel.webview.html = this.html();
    this.panel.webview.onDidReceiveMessage((m) => { if (isWebviewToHost(m)) void this.onMessage(m); }, null, this.disposables);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === this.uri.toString()) this.reparse('sectionsUpdated');
    }, null, this.disposables);
  }

  private post(msg: HostToWebview): void {
    if (this.disposed) return;
    this.panel.webview.postMessage(msg);
  }

  private async readText(): Promise<string> {
    const doc = await vscode.workspace.openTextDocument(this.uri);
    return doc.getText();
  }

  private async onMessage(msg: WebviewToHost): Promise<void> {
    switch (msg.type) {
      case 'ready':
        await this.reparse('init');
        break;
      case 'activeSectionChanged':
        if (!Number.isInteger(msg.index) || msg.index < 0) break;
        this.activeIndex = msg.index;
        await this.docStore.set(this.uri.toString(), { index: this.activeIndex, readIds: this.readIds });
        break;
      case 'setPaginationLevel':
        this.level = msg.level;
        await this.reparse('sectionsUpdated');
        break;
      case 'refresh':
        await this.reparse('sectionsUpdated');
        break;
      case 'openLink':
        await this.openLink(msg.href);
        break;
      case 'sectionRead':
        if (typeof msg.id === 'string' && this.pages.some((p) => p.id === msg.id) && !this.readIds.includes(msg.id)) {
          this.readIds.push(msg.id);
          await this.docStore.set(this.uri.toString(), { index: this.activeIndex, readIds: this.readIds });
        }
        break;
      case 'uiStateChanged':
        await this.uiStore.set({ config: msg.config, panels: msg.panels });
        break;
    }
  }

  private async openLink(href: string): Promise<void> {
    const kind = classifyLink(href);
    if (kind === 'external') {
      await vscode.env.openExternal(vscode.Uri.parse(href));
    } else if (kind === 'local') {
      const filePart = href.split('#')[0];
      if (!filePart) return; // pure fragment — handled inside the webview
      const target = vscode.Uri.joinPath(this.uri, '..', filePart);
      try {
        await vscode.window.showTextDocument(target);
      } catch {
        vscode.window.showErrorMessage(`MDeepen: could not open ${filePart}`);
      }
    }
    // anchors are handled inside the webview.
  }

  private reparse(kind: 'init' | 'sectionsUpdated'): Promise<void> {
    this.queue = this.queue
      .then(() => this.doReparse(kind))
      .catch((e) => {
        console.error('MDeepen: reparse failed', e);
      });
    return this.queue;
  }

  private async doReparse(kind: 'init' | 'sectionsUpdated'): Promise<void> {
    if (this.disposed) return;
    let text: string;
    try {
      text = await this.readText();
    } catch {
      if (!this.disposed) {
        vscode.window.showErrorMessage(`MDeepen: could not read ${this.uri.fsPath}`);
      }
      return;
    }
    if (this.disposed) return;
    const oldPages = this.pages;
    const result = sectionize(text, this.level);
    this.pages = result.pages;

    if (kind === 'init') {
      const uriString = this.uri.toString();
      const doc = this.docStore.get(uriString);
      this.readIds = remapReadIds(doc.readIds, result.pages, result.pages);
      this.activeIndex = Math.min(doc.index, Math.max(0, result.pages.length - 1));
      this.post({
        type: 'init',
        fileName: this.uri.path.split('/').pop() ?? 'document.md',
        pages: result.pages,
        outline: result.outline,
        effectiveLevel: result.effectiveLevel,
        restoredIndex: this.activeIndex,
        readIds: this.readIds,
        panels: this.uiStore.get().panels,
        config: this.uiStore.get().config,
      });
    } else {
      const uriString = this.uri.toString();
      this.activeIndex = reconcileIndex(oldPages, result.pages, this.activeIndex);
      this.readIds = remapReadIds(this.readIds, oldPages, result.pages);
      await this.docStore.set(uriString, { index: this.activeIndex, readIds: this.readIds });
      this.post({
        type: 'sectionsUpdated',
        pages: result.pages,
        outline: result.outline,
        effectiveLevel: result.effectiveLevel,
        keepIndex: this.activeIndex,
        readIds: this.readIds,
      });
    }
  }

  private html(): string {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'main.js'));
    const codiconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'codicons', 'codicon.css'),
    );
    const nonce = randomUUID().replace(/-/g, '');
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <link href="${codiconUri}" rel="stylesheet" />
  <title>MDeepen</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private dispose(): void {
    this.disposed = true;
    ReaderPanel.panels.delete(this.uri.toString());
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}
