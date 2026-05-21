import * as vscode from 'vscode';
import * as path from 'path';
import { WidgetClass, StateClass } from './parser';
import { createTempFileUri, cleanupTempDir, getDirName } from './fileOps';

export type OperationType = 'separate' | 'convert' | 'refactor' | undefined;

export async function pickOperation(
  hasStatefulWidgets: boolean,
  hasExtraClasses: boolean
): Promise<OperationType> {
  const options: vscode.QuickPickItem[] = [];

  if (hasExtraClasses) {
    options.push({
      label: '$(files) Separate Components',
      description: 'Extract widget classes into individual files in components/',
      detail: 'Detects widget classes beyond the first one and moves each to its own file.',
    });
  }

  if (hasStatefulWidgets) {
    options.push({
      label: '$(symbol-class) Convert StatefulWidget to StatelessWidget',
      description: 'Convert StatefulWidget classes to StatelessWidget',
      detail: 'Inlines the State build method, converts state fields to constructor params.',
    });
  }

  if (hasExtraClasses || hasStatefulWidgets) {
    options.push({
      label: '$(sparkle) Full Refactor',
      description: 'Separate components AND convert StatefulWidgets',
      detail: 'Run both operations with a full preview before applying.',
    });
  }

  if (options.length === 0) {
    vscode.window.showInformationMessage('No Flutter widgets found in this file.');
    return undefined;
  }

  const pick = await vscode.window.showQuickPick(options, {
    placeHolder: 'Choose a refactoring operation',
  });

  if (!pick) { return undefined; }

  if (pick.label.includes('Separate')) { return 'separate'; }
  if (pick.label.includes('Convert')) { return 'convert'; }
  if (pick.label.includes('Full Refactor')) { return 'refactor'; }

  return undefined;
}

export async function pickTargetWidgets(
  widgets: WidgetClass[],
  title: string
): Promise<number[]> {
  const items: (vscode.QuickPickItem & { index: number })[] = widgets.map((w, i) => ({
    label: `${w.isPrivate ? '(_) ' : ''}${w.name}`,
    description: `extends ${w.baseClass}`,
    detail: w.isStatefulWidget ? 'StatefulWidget' : '',
    index: i,
    picked: w.isStatefulWidget || !w.isPrivate,
  }));

  const picks = await vscode.window.showQuickPick(items, {
    placeHolder: title,
    canPickMany: true,
    matchOnDescription: true,
  });

  if (!picks || picks.length === 0) { return []; }

  return picks.map(p => p.index);
}

export async function showDiffPreview(
  originalContent: string,
  modifiedContent: string,
  originalFileName: string,
  modifiedLabel: string
): Promise<boolean> {
  const dirName = getDirName(originalFileName);

  try {
    const tempOriginalUri = vscode.Uri.file(
      createTempFileUri(dirName, `original_${path.basename(originalFileName)}`, originalContent)
    );
    const tempModifiedUri = vscode.Uri.file(
      createTempFileUri(dirName, `modified_${path.basename(originalFileName)}`, modifiedContent)
    );

    await vscode.commands.executeCommand(
      'vscode.diff',
      tempOriginalUri,
      tempModifiedUri,
      `${path.basename(originalFileName)}: Original ↔ ${modifiedLabel}`,
      { preview: true }
    );

    const choice = await vscode.window.showInformationMessage(
      'Review the changes. Apply this migration?',
      { modal: true },
      'Apply',
      'Cancel'
    );

    return choice === 'Apply';
  } finally {
    cleanupTempDir(dirName);
  }
}

export async function showSummary(
  mainWidgetName: string,
  separatedCount: number,
  convertedCount: number,
  warnings: string[]
): Promise<void> {
  let msg = `Flutter refactor complete!`;
  if (separatedCount > 0) {
    msg += ` ${separatedCount} component(s) separated.`;
  }
  if (convertedCount > 0) {
    msg += ` ${convertedCount} StatefulWidget(s) converted.`;
  }
  if (mainWidgetName) {
    msg += ` Main widget: ${mainWidgetName}.`;
  }

  if (warnings.length > 0) {
    msg += ` (${warnings.length} warning${warnings.length > 1 ? 's' : ''})`;
  }

  vscode.window.showInformationMessage(msg, 'OK');
}

export async function confirmMakePublic(className: string): Promise<boolean> {
  const choice = await vscode.window.showQuickPick(['Yes', 'No'], {
    placeHolder: `Make private widget ${className} public?`,
  });
  return choice === 'Yes';
}

export async function confirmConversion(
  widgetName: string,
  warnings: string[]
): Promise<boolean> {
  let detail = `Convert '${widgetName}' from StatefulWidget to StatelessWidget?`;
  if (warnings.length > 0) {
    detail += `\n\nWarnings:\n${warnings.map(w => `• ${w}`).join('\n')}`;
  }

  const choice = await vscode.window.showQuickPick(['Yes', 'No'], {
    placeHolder: detail,
  });
  return choice === 'Yes';
}

export function showProgress<T>(
  title: string,
  task: () => Promise<T>
): Thenable<T> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title,
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0 });
      const result = await task();
      progress.report({ increment: 100 });
      return result;
    }
  );
}
