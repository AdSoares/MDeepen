import * as vscode from 'vscode';
import { ReaderPanel } from './ReaderPanel';
import { DocStateStore, UiStateStore } from './state/positionStore';
import { AiConfigStore } from './ai/AiConfigStore';

export function activate(context: vscode.ExtensionContext): void {
  const docStore = new DocStateStore(context.workspaceState);
  const uiStore = new UiStateStore(context.globalState);
  const aiStore = new AiConfigStore(context.secrets, context.globalState);
  const cmd = vscode.commands.registerCommand('mdeepen.openReader', (uri?: vscode.Uri) => {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!target) {
      vscode.window.showWarningMessage('MDeepen: open a Markdown file first.');
      return;
    }
    ReaderPanel.open(context, target, docStore, uiStore, aiStore);
  });
  const configureCmd = vscode.commands.registerCommand('mdeepen.configureAi', () => {
    const target = vscode.window.activeTextEditor?.document.uri;
    if (!target) {
      vscode.window.showWarningMessage('MDeepen: open a Markdown file first.');
      return;
    }
    ReaderPanel.open(context, target, docStore, uiStore, aiStore).requestAiConfig();
  });
  const nextCmd = vscode.commands.registerCommand('mdeepen.nextSection', () => ReaderPanel.navigateActive(1));
  const prevCmd = vscode.commands.registerCommand('mdeepen.previousSection', () => ReaderPanel.navigateActive(-1));
  context.subscriptions.push(cmd, configureCmd, nextCmd, prevCmd);
}

export function deactivate(): void {}
