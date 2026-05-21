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
import { ensureDir, writeFile, getDirName, joinPath } from './fileOps';
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

async function separateComponents(text: string, filePath: string): Promise<boolean> {
  const dirName = getDirName(filePath);
  const config = getConfig();
  const componentsDir = joinPath(dirName, config.componentsFolderName);
  ensureDir(componentsDir);

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

  const actualIndices = targetIndices.map(i => i + 1);
  let mainContent = text;
  const allWarnings: string[] = [];

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

    writeFile(componentFilePath, componentContent);
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
    writeFile(filePath, mainContent);
    await showSummary(mainWidgetName, actualIndices.length, 0, allWarnings);
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
    writeFile(filePath, modifiedContent);
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
  ensureDir(componentsDir);

  let mainContent = text;
  let separatedCount = 0;
  let convertedCount = 0;
  const allWarnings: string[] = [];
  const mainWidgetName = parsed.widgets[0]?.name || '';

  const nonMainWidgets = parsed.widgets.slice(1);
  const extractables = nonMainWidgets.filter(w => !w.isStatefulWidget || !parsed.stateMap.has(widgetIndexOf(w, parsed)));

  const extractIndices = extractables.length > 0
    ? await pickTargetWidgets(extractables, 'Select widget classes to separate into files')
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

  if ((!extractIndices || extractIndices.length === 0) && (!convertTargets || convertTargets.length === 0)) {
    return false;
  }

  if (extractIndices && extractIndices.length > 0) {
    for (const idx of extractIndices.map(i => i + 1)) {
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

      writeFile(componentFilePath, componentContent);
      separatedCount++;
    }
  }

  if (convertTargets && convertTargets.length > 0) {
    const actualConvertIndices = convertTargets.map(i => statefulIndices[i]);
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

  mainContent = cleanBlankLines(mainContent);

  const confirmed = await showDiffPreview(
    text,
    mainContent,
    filePath,
    `Full Refactor (${separatedCount} extracted, ${convertedCount} converted)`
  );

  if (confirmed) {
    writeFile(filePath, mainContent);
    await showSummary(mainWidgetName, separatedCount, convertedCount, allWarnings);
    return true;
  }

  return false;
}

function widgetIndexOf(widget: WidgetClass, parsed: ReturnType<typeof parseFile>): number {
  return parsed.widgets.findIndex(w => w.startOffset === widget.startOffset);
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

  await showProgress('Separating Flutter components...', async () => {
    await separateComponents(text, filePath);
  });

  updateStatusBar();
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

  await showProgress('Converting to StatelessWidget...', async () => {
    await convertToStateless(text, filePath);
  });

  updateStatusBar();
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

  updateStatusBar();
}
