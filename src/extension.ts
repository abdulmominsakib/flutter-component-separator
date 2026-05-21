import * as vscode from 'vscode';
import {
  separateFlutterComponentsCommand,
  convertToStatelessCommand,
  refactorFlutterCommand,
} from './commands';

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
}

export function deactivate() { }