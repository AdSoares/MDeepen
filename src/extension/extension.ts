import * as vscode from 'vscode';
import { ReaderPanel } from './ReaderPanel';
import { PositionStore } from './state/positionStore';

export function activate(context: vscode.ExtensionContext): void {
  const store = new PositionStore(context.workspaceState);
  const cmd = vscode.commands.registerCommand('mdeepen.openReader', (uri?: vscode.Uri) => {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!target) {
      vscode.window.showWarningMessage('MDeepen: open a Markdown file first.');
      return;
    }
    ReaderPanel.open(context, target, store);
  });
  context.subscriptions.push(cmd);
}

export function deactivate(): void {}
