import * as vscode from 'vscode';

export interface ExtensionConfig {
  defaultOperation: 'ask' | 'separate' | 'convert' | 'refactor';
  componentsFolderName: string;
  showStatusBar: boolean;
}

export function getConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('flutterComponentSeparator');
  return {
    defaultOperation: cfg.get('defaultOperation', 'ask'),
    componentsFolderName: cfg.get('componentsFolderName', 'components'),
    showStatusBar: cfg.get('showStatusBar', true),
  };
}
