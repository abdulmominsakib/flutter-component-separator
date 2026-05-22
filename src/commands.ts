import * as vscode from 'vscode';
import * as path from 'path';
import { parseFile, WidgetClass, ParsedFile, detectDependencies, expandTransitiveDependencies } from './parser';
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

  if (doc.isDirty) {
    const choice = await vscode.window.showWarningMessage(
      'The file has unsaved changes. Save before applying refactor?',
      { modal: true },
      'Save and Continue',
      'Cancel'
    );
    if (choice !== 'Save and Continue') {
      throw new Error('Refactor cancelled — file has unsaved changes.');
    }
    await doc.save();
  }

  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(
    doc.positionAt(0),
    doc.positionAt(doc.getText().length)
  );
  edit.replace(docUri, fullRange, newContent);
  await vscode.workspace.applyEdit(edit);
  await doc.save();
}

interface ExtractionResult {
  mainContent: string;
  componentFiles: { path: string; content: string }[];
  separatedCount: number;
}

async function performExtractions(
  content: string,
  filePath: string,
  parsed: ParsedFile,
  finalSeparatedIndices: Set<number>,
  deps: Map<number, number[]>,
  componentsDir: string,
  componentsFolderName: string
): Promise<ExtractionResult> {
  const renames = new Map<string, string>();
  const finalizedNames = new Map<number, string>();

  // Determine finalized class names and renames
  for (let i = 0; i < parsed.widgets.length; i++) {
    const w = parsed.widgets[i];
    if (w.baseClass.startsWith('State<')) {
      continue;
    }
    let finalName = w.isPrivate ? `_${w.name}` : w.name;
    if (finalSeparatedIndices.has(i) && w.isPrivate) {
      const makePublic = await confirmMakePublic(w.name);
      if (makePublic) {
        finalName = w.name;
        renames.set(`_${w.name}`, w.name);
      }
    }
    finalizedNames.set(i, finalName);
  }

  let mainContent = content;
  const componentFiles: { path: string; content: string }[] = [];
  const newImports: string[] = [];

  const sortedSeparatedIndices = Array.from(finalSeparatedIndices).sort((a, b) => b - a);

  for (const idx of sortedSeparatedIndices) {
    const widget = parsed.widgets[idx];
    const state = parsed.stateMap.get(idx);

    let componentContent = widget.fullMatch;
    if (state) {
      componentContent += '\n\n' + state.fullMatch;
    }

    const widgetDeps = deps.get(idx) || [];
    const componentImports = adjustImports(parsed.imports);

    let hasMainFileDep = false;
    for (const depIdx of widgetDeps) {
      if (finalSeparatedIndices.has(depIdx)) {
        const depName = finalizedNames.get(depIdx)!;
        const siblingFileName = `${pascalToSnake(depName)}.dart`;
        componentImports.push(`import '${siblingFileName}';`);
      } else {
        hasMainFileDep = true;
      }
    }

    if (hasMainFileDep) {
      let relativeImportPath = path.relative(componentsDir, filePath);
      relativeImportPath = relativeImportPath.replace(/\\/g, '/');
      componentImports.push(`import '${relativeImportPath}';`);
    }

    const uniqueImports = Array.from(new Set(componentImports));
    componentContent = wrapWithImports(componentContent, uniqueImports);

    for (const [oldName, newName] of renames.entries()) {
      componentContent = updateReferencesInFile(componentContent, oldName, newName);
    }

    const componentFileName = `${pascalToSnake(finalizedNames.get(idx)!)}.dart`;
    const componentFilePath = joinPath(componentsDir, componentFileName);

    const newImport = `import '${componentsFolderName}/${componentFileName}';`;
    newImports.push(newImport);

    mainContent = stripClassFromContent(mainContent, widget.fullMatch);
    if (state) {
      mainContent = stripClassFromContent(mainContent, state.fullMatch);
    }

    componentFiles.push({ path: componentFilePath, content: componentContent });
  }

  for (const [oldName, newName] of renames.entries()) {
    mainContent = updateReferencesInFile(mainContent, oldName, newName);
  }

  mainContent = insertImportsAfterExisting(mainContent, newImports);
  mainContent = cleanBlankLines(mainContent);

  return {
    mainContent,
    componentFiles,
    separatedCount: finalSeparatedIndices.size,
  };
}

async function separateComponents(text: string, filePath: string): Promise<boolean> {
  const dirName = getDirName(filePath);
  const config = getConfig();
  const componentsDir = joinPath(dirName, config.componentsFolderName);

  const parsed = parseFile(text);

  const pickableItems = parsed.widgets
    .map((w, i) => ({ widget: w, originalIndex: i }))
    .slice(1)
    .filter(item => !item.widget.baseClass.startsWith('State<'));

  if (pickableItems.length === 0) {
    vscode.window.showInformationMessage('No additional widget classes found to separate.');
    return false;
  }

  const targetIndices = await pickTargetWidgets(
    pickableItems.map(item => item.widget),
    'Select widget classes to separate into files'
  );
  if (targetIndices.length === 0) { return false; }

  const selectedOriginalIndices = new Set<number>(targetIndices.map(i => pickableItems[i].originalIndex));

  const deps = detectDependencies(parsed.widgets, parsed.stateMap);

  const finalSeparatedIndices = expandTransitiveDependencies(selectedOriginalIndices, parsed.widgets, deps);

  const extraction = await performExtractions(
    text,
    filePath,
    parsed,
    finalSeparatedIndices,
    deps,
    componentsDir,
    config.componentsFolderName
  );

  ensureDir(componentsDir);
  for (const cf of extraction.componentFiles) {
    const fs = await import('fs');
    fs.writeFileSync(cf.path, cf.content);
  }
  await applyDocumentEdit(filePath, extraction.mainContent);

  const mainWidgetName = parsed.widgets[0]?.name || '';
  await showSummary(mainWidgetName, extraction.separatedCount, 0, []);
  return true;
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

  await applyDocumentEdit(filePath, modifiedContent);
  await showSummary('', 0, convertedCount, allWarnings);
  return true;
}

async function fullRefactor(text: string, filePath: string): Promise<boolean> {
  const originalParsed = parseFile(text);
  const dirName = getDirName(filePath);
  const config = getConfig();
  const componentsDir = joinPath(dirName, config.componentsFolderName);

  // Build list of extractable widgets with their original indices
  const extractableItems: { widget: WidgetClass; originalIndex: number }[] = [];
  for (let i = 1; i < originalParsed.widgets.length; i++) {
    const w = originalParsed.widgets[i];
    if (!w.baseClass.startsWith('State<')) {
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
  for (let i = 0; i < originalParsed.widgets.length; i++) {
    const w = originalParsed.widgets[i];
    if (w.isStatefulWidget && originalParsed.stateMap.has(i)) {
      statefulIndices.push(i);
    }
  }

  const convertTargets = statefulIndices.length > 0
    ? await pickTargetWidgets(
        statefulIndices.map(i => originalParsed.widgets[i]),
        'Select StatefulWidget classes to convert to StatelessWidget'
      )
    : [];

  if (extractIndices.length === 0 && convertTargets.length === 0) {
    return false;
  }

  // Get names of widgets chosen for conversion and extraction
  const convertNames = new Set(convertTargets.map(i => originalParsed.widgets[statefulIndices[i]].name));
  const extractNames = new Set(extractIndices.map(i => extractableItems[i].widget.name));

  // Step 1: Perform conversions in reverse order on original text
  let convertedContent = text;
  let convertedCount = 0;
  const allWarnings: string[] = [];

  if (convertTargets.length > 0) {
    const actualConvertIndices = convertTargets.map(i => statefulIndices[i]);
    actualConvertIndices.sort((a, b) => b - a);

    for (const idx of actualConvertIndices) {
      const widget = originalParsed.widgets[idx];
      const state = originalParsed.stateMap.get(idx)!;
      const result = convertStatefulToStateless(widget, state);

      allWarnings.push(
        ...result.warnings.map(w => `${result.originalWidgetName}: ${w}`)
      );

      convertedContent = replaceWidgetPairInContent(
        convertedContent,
        { ...widget, startOffset: widget.startOffset, endOffset: widget.endOffset },
        { ...state, startOffset: state.startOffset, endOffset: state.endOffset },
        result.newContent
      );

      convertedCount++;
    }
  }

  // Step 2: Perform extractions on the converted text
  let mainContent = convertedContent;
  let separatedCount = 0;
  const componentFiles: { path: string; content: string }[] = [];

  if (extractNames.size > 0) {
    const parsed = parseFile(convertedContent);

    // Map names back to original indices in the new parsed structure
    const selectedOriginalIndices = new Set<number>();
    for (let i = 1; i < parsed.widgets.length; i++) {
      const w = parsed.widgets[i];
      if (extractNames.has(w.name)) {
        selectedOriginalIndices.add(i);
      }
    }

    const deps = detectDependencies(parsed.widgets, parsed.stateMap);

    const finalSeparatedIndices = expandTransitiveDependencies(selectedOriginalIndices, parsed.widgets, deps);

    const extraction = await performExtractions(
      convertedContent,
      filePath,
      parsed,
      finalSeparatedIndices,
      deps,
      componentsDir,
      config.componentsFolderName
    );

    mainContent = extraction.mainContent;
    separatedCount = extraction.separatedCount;
    componentFiles.push(...extraction.componentFiles);
  } else {
    mainContent = cleanBlankLines(mainContent);
  }

  // Write new component files directly and apply document edit, bypassing showDiffPreview!
  ensureDir(componentsDir);
  for (const cf of componentFiles) {
    const fs = await import('fs');
    fs.writeFileSync(cf.path, cf.content);
  }
  await applyDocumentEdit(filePath, mainContent);

  const mainWidgetName = originalParsed.widgets[0]?.name || '';
  await showSummary(mainWidgetName, separatedCount, convertedCount, allWarnings);
  return true;
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
    let operation: 'separate' | 'convert' | 'refactor' | 'ask' | undefined = config.defaultOperation;

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
