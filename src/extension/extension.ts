import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const cmd = vscode.commands.registerCommand('mdeepen.openReader', (uri?: vscode.Uri) => {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!target) {
      vscode.window.showWarningMessage('MDeepen: open a Markdown file first.');
      return;
    }
    // Wired to ReaderPanel in Task 8.
    vscode.window.showInformationMessage(`MDeepen will open: ${target.fsPath}`);
  });
  context.subscriptions.push(cmd);
}

export function deactivate(): void {}
