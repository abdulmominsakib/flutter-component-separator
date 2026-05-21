import * as vscode from 'vscode';
import {
  separateFlutterComponentsCommand,
  convertToStatelessCommand,
  refactorFlutterCommand,
} from './commands';
import { FlutterCodeActionProvider } from './codeActionProvider';
import { createStatusBarItem, updateStatusBar } from './statusBar';
import { clearParseCache } from './config';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'extension.separateFlutterComponents',
      separateFlutterComponentsCommand
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'extension.convertToStatelessWidget',
      convertToStatelessCommand
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'extension.refactorFlutter',
      refactorFlutterCommand
    )
  );

  // Register Code Action Provider for Dart files (only real files)
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { language: 'dart', scheme: 'file' },
      new FlutterCodeActionProvider(),
      {
        providedCodeActionKinds: FlutterCodeActionProvider.providedCodeActionKinds,
      }
    )
  );

  // Initialize status bar
  createStatusBarItem(context);

  // Refresh status bar when configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(() => updateStatusBar())
  );

  // Invalidate parse cache when documents change
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      clearParseCache(e.document.uri);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      clearParseCache(doc.uri);
    })
  );
}

export function deactivate() {
  clearParseCache();
}