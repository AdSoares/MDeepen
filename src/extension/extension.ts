import * as vscode from 'vscode';
import { ReaderPanel } from './ReaderPanel';
import { DocStateStore, UiStateStore } from './state/positionStore';

export function activate(context: vscode.ExtensionContext): void {
  const docStore = new DocStateStore(context.workspaceState);
  const uiStore = new UiStateStore(context.globalState);
  const cmd = vscode.commands.registerCommand('mdeepen.openReader', (uri?: vscode.Uri) => {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!target) {
      vscode.window.showWarningMessage('MDeepen: open a Markdown file first.');
      return;
    }
    ReaderPanel.open(context, target, docStore, uiStore);
  });
  context.subscriptions.push(cmd);
}

export function deactivate(): void {}
