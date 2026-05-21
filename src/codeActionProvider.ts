import * as vscode from 'vscode';
import { parseFile, ParsedFile } from './parser';
import { getCachedParse, setCachedParse } from './config';

export class FlutterCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.RefactorRewrite,
  ];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    _context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] | undefined {
    if (document.languageId !== 'dart') {
      return undefined;
    }

    // Use cached parse if available
    let parsed: ParsedFile | null = getCachedParse(document);
    if (!parsed) {
      const text = document.getText();
      parsed = parseFile(text);
      setCachedParse(document, parsed);
    }

    if (parsed.widgets.length === 0) {
      return undefined;
    }

    // Find which widget (if any) the cursor is inside
    const cursorOffset = document.offsetAt(range.start);
    let targetWidgetIndex = -1;

    for (let i = 0; i < parsed.widgets.length; i++) {
      const w = parsed.widgets[i];
      if (cursorOffset >= w.startOffset && cursorOffset <= w.endOffset) {
        targetWidgetIndex = i;
        break;
      }
    }

    const actions: vscode.CodeAction[] = [];
    const hasStatefulWidgets = parsed.widgets.some(
      (w, i) => w.isStatefulWidget && parsed!.stateMap.has(i)
    );
    const hasExtraClasses = parsed.widgets.length > 1;

    // If cursor is inside a StatefulWidget, offer conversion
    if (
      targetWidgetIndex >= 0 &&
      parsed.widgets[targetWidgetIndex].isStatefulWidget &&
      parsed.stateMap.has(targetWidgetIndex)
    ) {
      const convertAction = new vscode.CodeAction(
        'Flutter: Convert this StatefulWidget to StatelessWidget',
        vscode.CodeActionKind.RefactorRewrite
      );
      convertAction.command = {
        command: 'extension.convertToStatelessWidget',
        title: 'Convert to StatelessWidget',
      };
      actions.push(convertAction);
    }

    // If there are extra widgets and cursor is on a non-main widget, offer separate
    if (hasExtraClasses && targetWidgetIndex > 0) {
      const separateAction = new vscode.CodeAction(
        'Flutter: Separate this widget into components',
        vscode.CodeActionKind.RefactorRewrite
      );
      separateAction.command = {
        command: 'extension.separateFlutterComponents',
        title: 'Separate Components',
      };
      actions.push(separateAction);
    }

    // Always offer Full Refactor if any operations are available
    if (hasExtraClasses || hasStatefulWidgets) {
      const refactorAction = new vscode.CodeAction(
        'Flutter: Full Refactor (Separate + Convert)',
        vscode.CodeActionKind.RefactorRewrite
      );
      refactorAction.command = {
        command: 'extension.refactorFlutter',
        title: 'Full Refactor',
      };
      actions.push(refactorAction);
    }

    return actions.length > 0 ? actions : undefined;
  }
}
