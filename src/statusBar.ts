import * as vscode from 'vscode';
import { parseFile, ParsedFile } from './parser';
import { getConfig, getCachedParse, setCachedParse } from './config';

let statusBarItem: vscode.StatusBarItem | undefined;

export function createStatusBarItem(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'extension.refactorFlutter';
  context.subscriptions.push(statusBarItem);

  updateStatusBar();

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => updateStatusBar())
  );
}

export function updateStatusBar(): void {
  if (!statusBarItem) {
    return;
  }

  const config = getConfig();
  if (!config.showStatusBar) {
    statusBarItem.hide();
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'dart') {
    statusBarItem.hide();
    return;
  }

  // Use cached parse if available
  let parsed: ParsedFile | null = getCachedParse(editor.document);
  if (!parsed) {
    const text = editor.document.getText();
    parsed = parseFile(text);
    setCachedParse(editor.document, parsed);
  }

  if (parsed.widgets.length === 0) {
    statusBarItem.hide();
    return;
  }

  const widgetCount = parsed.widgets.length;
  const statefulCount = parsed.stateMap.size;

  let tooltip = 'Flutter Component Separator';
  if (widgetCount > 1) {
    tooltip += `\n${widgetCount - 1} component(s) can be separated`;
  }
  if (statefulCount > 0) {
    tooltip += `\n${statefulCount} StatefulWidget(s) can be converted`;
  }
  tooltip += '\nClick to run Full Refactor';

  // Use a generic widget icon instead of Flutter-specific one
  statusBarItem.text = `$(symbol-class) ${widgetCount} widget${widgetCount > 1 ? 's' : ''}${statefulCount > 0 ? ` · ${statefulCount} stateful` : ''}`;
  statusBarItem.tooltip = tooltip;
  statusBarItem.show();
}

export function hideStatusBar(): void {
  if (statusBarItem) {
    statusBarItem.hide();
  }
}

export function disposeStatusBar(): void {
  if (statusBarItem) {
    statusBarItem.dispose();
    statusBarItem = undefined;
  }
}
