import * as vscode from 'vscode';
import { parseFile, ParsedFile } from './parser';

// Simple document-based parse cache
const parseCache = new Map<string, { version: number; parsed: ParsedFile }>();

export function getCachedParse(document: vscode.TextDocument): ParsedFile | null {
  const key = document.uri.toString();
  const cached = parseCache.get(key);
  if (cached && cached.version === document.version) {
    return cached.parsed;
  }
  return null;
}

export function setCachedParse(document: vscode.TextDocument, parsed: ParsedFile): void {
  const key = document.uri.toString();
  parseCache.set(key, { version: document.version, parsed });
}

export function clearParseCache(uri?: vscode.Uri): void {
  if (uri) {
    parseCache.delete(uri.toString());
  } else {
    parseCache.clear();
  }
}

export type DefaultOperation = 'ask' | 'separate' | 'convert' | 'refactor';

export interface ExtensionConfig {
  defaultOperation: DefaultOperation;
  componentsFolderName: string;
  showStatusBar: boolean;
}

export function getConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('flutterComponentSeparator');
  const defaultOp = cfg.get<string>('defaultOperation', 'ask');
  const validOps: DefaultOperation[] = ['ask', 'separate', 'convert', 'refactor'];
  const folderName = cfg.get<string>('componentsFolderName', 'components') || 'components';

  return {
    defaultOperation: validOps.includes(defaultOp as DefaultOperation) ? (defaultOp as DefaultOperation) : 'ask',
    componentsFolderName: sanitizeFolderName(folderName),
    showStatusBar: cfg.get<boolean>('showStatusBar', true),
  };
}

function sanitizeFolderName(name: string): string {
  // Remove path traversal sequences and invalid characters
  return name
    .replace(/[\\/]+/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/[<>:"|?*]/g, '_')
    .trim() || 'components';
}
