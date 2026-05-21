import * as vscode from 'vscode';
import * as path from 'path';
import { parseFile, WidgetClass } from './parser';
import { convertStatefulToStateless, replaceWidgetPairInContent } from './converter';
import {
  pascalToSnake,
  adjustImports,
  makeWidgetPublic,
  updateReferencesInFile,
  insertImportsAfterExisting,
  cleanBlankLines,
  stripClassFromContent,
  wrapWithImports,
} from './transformer';
import { ensureDir, getDirName, joinPath } from './fileOps';
import {
  pickOperation,
  pickTargetWidgets,
  showDiffPreview,
  showSummary,
  confirmMakePublic,
  showProgress,
} from './ui';
import { getConfig } from './config';
import { updateStatusBar } from './statusBar';

// Apply edits to a document using WorkspaceEdit for undo support
async function applyDocumentEdit(filePath: string, newContent: string): Promise<void> {
  const docUri = vscode.Uri.file(filePath);
  const doc = await vscode.workspace.openTextDocument(docUri);
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(
    doc.positionAt(0),
    doc.positionAt(doc.getText().length)
  );
  edit.replace(docUri, fullRange, newContent);
  await vscode.workspace.applyEdit(edit);
  await doc.save();
}

async function separateComponents(text: string, filePath: string): Promise<boolean> {
  const dirName = getDirName(filePath);
  const config = getConfig();
  const componentsDir = joinPath(dirName, config.componentsFolderName);

  const parsed = parseFile(text);
  if (parsed.widgets.length <= 1) {
    vscode.window.showInformationMessage('No additional widget classes found to separate.');
    return false;
  }

  const targetIndices = await pickTargetWidgets(
    parsed.widgets.slice(1),
    'Select widget classes to separate into files'
  );
  if (targetIndices.length === 0) { return false; }

  // Map pick indices back to original widget indices (slice(1) offset = +1)
  const actualIndices = targetIndices.map(i => i + 1);
  // Sort descending so we strip from the end first, preserving earlier offsets
  actualIndices.sort((a, b) => b - a);

  let mainContent = text;
  const componentFiles: { path: string; content: string }[] = [];

  for (const idx of actualIndices) {
    const widget = parsed.widgets[idx];
    let componentContent = widget.fullMatch;
    let className = widget.name;

    if (widget.isPrivate) {
      const makePublic = await confirmMakePublic(className);
      if (makePublic) {
        const oldClassName = `_${className}`;
        const newClassName = className;
        componentContent = makeWidgetPublic(componentContent, oldClassName, newClassName);
        mainContent = updateReferencesInFile(mainContent, oldClassName, newClassName);
      }
    }

    componentContent = wrapWithImports(componentContent, adjustImports(parsed.imports));

    const componentFileName = `${pascalToSnake(className)}.dart`;
    const componentFilePath = joinPath(componentsDir, componentFileName);

    const newImport = `import '${config.componentsFolderName}/${componentFileName}';`;
    mainContent = insertImportsAfterExisting(mainContent, [newImport]);
    mainContent = stripClassFromContent(mainContent, widget.fullMatch);

    componentFiles.push({ path: componentFilePath, content: componentContent });
  }

  mainContent = cleanBlankLines(mainContent);

  const mainWidgetName = parsed.widgets[0]?.name || '';
  const confirmed = await showDiffPreview(
    text,
    mainContent,
    filePath,
    'Separated Components'
  );

  if (confirmed) {
    ensureDir(componentsDir);
    for (const cf of componentFiles) {
      // Use fs for new files; WorkspaceEdit only works for existing documents
      const fs = await import('fs');
      fs.writeFileSync(cf.path, cf.content);
    }
    await applyDocumentEdit(filePath, mainContent);
    await showSummary(mainWidgetName, actualIndices.length, 0, []);
    return true;
  }

  return false;
}

async function convertToStateless(text: string, filePath: string): Promise<boolean> {
  const parsed = parseFile(text);
  const statefulIndices = parsed.widgets
    .map((w, i) => (w.isStatefulWidget && parsed.stateMap.has(i)) ? i : -1)
    .filter(i => i >= 0);

  if (statefulIndices.length === 0) {
    vscode.window.showInformationMessage('No StatefulWidget classes with State found to convert.');
    return false;
  }

  const statefulWidgets = statefulIndices.map(i => parsed.widgets[i]);
  const targetIndices = await pickTargetWidgets(
    statefulWidgets,
    'Select StatefulWidget classes to convert to StatelessWidget'
  );
  if (targetIndices.length === 0) { return false; }

  const actualIndices = targetIndices.map(i => statefulIndices[i]);
  // Sort descending so we replace from the end first, preserving earlier offsets
  actualIndices.sort((a, b) => b - a);

  let modifiedContent = text;
  let convertedCount = 0;
  const allWarnings: string[] = [];

  for (const idx of actualIndices) {
    const widget = parsed.widgets[idx];
    const state = parsed.stateMap.get(idx)!;
    const result = convertStatefulToStateless(widget, state);

    allWarnings.push(
      ...result.warnings.map(w => `${result.originalWidgetName}: ${w}`)
    );

    modifiedContent = replaceWidgetPairInContent(
      modifiedContent,
      { ...widget, startOffset: widget.startOffset, endOffset: widget.endOffset },
      { ...state, startOffset: state.startOffset, endOffset: state.endOffset },
      result.newContent
    );

    convertedCount++;
  }

  modifiedContent = cleanBlankLines(modifiedContent);

  const confirmed = await showDiffPreview(
    text,
    modifiedContent,
    filePath,
    `StatelessWidget Conversion (${convertedCount} widget(s))`
  );

  if (confirmed) {
    await applyDocumentEdit(filePath, modifiedContent);
    await showSummary('', 0, convertedCount, allWarnings);
    return true;
  }

  return false;
}

async function fullRefactor(text: string, filePath: string): Promise<boolean> {
  const parsed = parseFile(text);
  const dirName = getDirName(filePath);
  const config = getConfig();
  const componentsDir = joinPath(dirName, config.componentsFolderName);

  // Build list of extractable widgets with their original indices
  const extractableItems: { widget: WidgetClass; originalIndex: number }[] = [];
  for (let i = 1; i < parsed.widgets.length; i++) {
    const w = parsed.widgets[i];
    // Only extract widgets that are NOT StatefulWidget with a State class
    if (!w.isStatefulWidget || !parsed.stateMap.has(i)) {
      extractableItems.push({ widget: w, originalIndex: i });
    }
  }

  const extractIndices = extractableItems.length > 0
    ? await pickTargetWidgets(
        extractableItems.map(e => e.widget),
        'Select widget classes to separate into files'
      )
    : [];

  const statefulIndices: number[] = [];
  for (let i = 0; i < parsed.widgets.length; i++) {
    if (parsed.widgets[i].isStatefulWidget && parsed.stateMap.has(i)) {
      statefulIndices.push(i);
    }
  }

  const convertTargets = statefulIndices.length > 0
    ? await pickTargetWidgets(
        statefulIndices.map(i => parsed.widgets[i]),
        'Select StatefulWidget classes to convert to StatelessWidget'
      )
    : [];

  if (extractIndices.length === 0 && convertTargets.length === 0) {
    return false;
  }

  // Step 1: Perform conversions in reverse order on original text
  let mainContent = text;
  let convertedCount = 0;
  const allWarnings: string[] = [];

  if (convertTargets.length > 0) {
    const actualConvertIndices = convertTargets.map(i => statefulIndices[i]);
    // Sort descending to preserve offsets
    actualConvertIndices.sort((a, b) => b - a);

    for (const idx of actualConvertIndices) {
      const widget = parsed.widgets[idx];
      const state = parsed.stateMap.get(idx)!;
      const result = convertStatefulToStateless(widget, state);

      allWarnings.push(
        ...result.warnings.map(w => `${result.originalWidgetName}: ${w}`)
      );

      mainContent = replaceWidgetPairInContent(
        mainContent,
        { ...widget, startOffset: widget.startOffset, endOffset: widget.endOffset },
        { ...state, startOffset: state.startOffset, endOffset: state.endOffset },
        result.newContent
      );

      convertedCount++;
    }
  }

  // Step 2: Perform extractions in reverse order on the converted text
  let separatedCount = 0;
  const componentFiles: { path: string; content: string }[] = [];

  if (extractIndices.length > 0) {
    // Get original indices and sort descending
    const actualExtractIndices = extractIndices
      .map(i => extractableItems[i].originalIndex)
      .sort((a, b) => b - a);

    for (const idx of actualExtractIndices) {
      const widget = parsed.widgets[idx];
      let componentContent = widget.fullMatch;
      let className = widget.name;

      if (widget.isPrivate) {
        const makePublic = await confirmMakePublic(className);
        if (makePublic) {
          const oldClassName = `_${className}`;
          const newClassName = className;
          componentContent = makeWidgetPublic(componentContent, oldClassName, newClassName);
          mainContent = updateReferencesInFile(mainContent, oldClassName, newClassName);
        }
      }

      componentContent = wrapWithImports(componentContent, adjustImports(parsed.imports));

      const componentFileName = `${pascalToSnake(className)}.dart`;
      const componentFilePath = joinPath(componentsDir, componentFileName);

      const newImport = `import '${config.componentsFolderName}/${componentFileName}';`;
      mainContent = insertImportsAfterExisting(mainContent, [newImport]);
      mainContent = stripClassFromContent(mainContent, widget.fullMatch);

      componentFiles.push({ path: componentFilePath, content: componentContent });
      separatedCount++;
    }
  }

  mainContent = cleanBlankLines(mainContent);

  const mainWidgetName = parsed.widgets[0]?.name || '';
  const confirmed = await showDiffPreview(
    text,
    mainContent,
    filePath,
    `Full Refactor (${separatedCount} extracted, ${convertedCount} converted)`
  );

  if (confirmed) {
    ensureDir(componentsDir);
    for (const cf of componentFiles) {
      const fs = await import('fs');
      fs.writeFileSync(cf.path, cf.content);
    }
    await applyDocumentEdit(filePath, mainContent);
    await showSummary(mainWidgetName, separatedCount, convertedCount, allWarnings);
    return true;
  }

  return false;
}

export async function separateFlutterComponentsCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor!');
    return;
  }

  const document = editor.document;
  const text = document.getText();
  const filePath = document.fileName;

  try {
    await showProgress('Separating Flutter components...', async () => {
      await separateComponents(text, filePath);
    });
  } catch (err) {
    vscode.window.showErrorMessage(`Flutter Component Separator error: ${err}`);
  } finally {
    updateStatusBar();
  }
}

export async function convertToStatelessCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor!');
    return;
  }

  const document = editor.document;
  const text = document.getText();
  const filePath = document.fileName;

  try {
    await showProgress('Converting to StatelessWidget...', async () => {
      await convertToStateless(text, filePath);
    });
  } catch (err) {
    vscode.window.showErrorMessage(`Flutter Component Separator error: ${err}`);
  } finally {
    updateStatusBar();
  }
}

export async function refactorFlutterCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor!');
    return;
  }

  const document = editor.document;
  const text = document.getText();
  const filePath = document.fileName;

  try {
    const parsed = parseFile(text);
    const hasStatefulWidgets = parsed.widgets.some(w => w.isStatefulWidget && parsed.stateMap.has(parsed.widgets.indexOf(w)));
    const hasExtraClasses = parsed.widgets.length > 1;

    const config = getConfig();
    let operation: 'separate' | 'convert' | 'refactor' | 'ask' | undefined = config.defaultOperation as 'separate' | 'convert' | 'refactor' | 'ask';

    // Validate that the default operation is actually available
    if (operation === 'separate' && !hasExtraClasses) {
      operation = 'ask';
    } else if (operation === 'convert' && !hasStatefulWidgets) {
      operation = 'ask';
    } else if (operation === 'refactor' && !hasExtraClasses && !hasStatefulWidgets) {
      operation = 'ask';
    }

    if (operation === 'ask' || !operation) {
      operation = await pickOperation(hasStatefulWidgets, hasExtraClasses);
    }

    if (!operation) { return; }

    await showProgress('Processing Flutter refactor...', async () => {
      switch (operation) {
        case 'separate':
          await separateComponents(text, filePath);
          break;
        case 'convert':
          await convertToStateless(text, filePath);
          break;
        case 'refactor':
          await fullRefactor(text, filePath);
          break;
      }
    });
  } catch (err) {
    vscode.window.showErrorMessage(`Flutter Component Separator error: ${err}`);
  } finally {
    updateStatusBar();
  }
}
