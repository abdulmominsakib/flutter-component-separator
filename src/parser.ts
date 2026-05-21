import * as vscode from 'vscode';

export interface WidgetClass {
  matchIndex: number;
  fullMatch: string;
  isPrivate: boolean;
  name: string;
  baseClass: string;
  isStatefulWidget: boolean;
  startOffset: number;
  endOffset: number;
}

export interface StateClass {
  fullMatch: string;
  name: string;
  widgetName: string;
  buildMethodBody: string;
  stateFields: StateField[];
  hasSetState: boolean;
  hasInitState: boolean;
  hasDispose: boolean;
  hasDidChangeDependencies: boolean;
  hasDidUpdateWidget: boolean;
  startOffset: number;
  endOffset: number;
}

export interface StateField {
  declaration: string;
  name: string;
  type: string;
  defaultValue: string;
}

export interface ParsedFile {
  imports: string[];
  widgets: WidgetClass[];
  stateMap: Map<number, StateClass>;
}

const IMPORT_REGEX = /^import\s+['"]([^'"]+)['"];?\s*$/gm;

const CLASS_REGEX = /class\s+(_?)(\w+)\s+extends\s+([\w<>,\s]+?)\s*\{[\s\S]*?^\}/gm;

const STATEFUL_WIDGET_RE = /extends\s+StatefulWidget\b/;
const STATELESS_WIDGET_RE = /extends\s+StatelessWidget\b/;

function findMatchingBrace(text: string, startIndex: number): number {
  let depth = 0;
  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === '{') { depth++; }
    if (text[i] === '}') {
      depth--;
      if (depth === 0) { return i; }
    }
  }
  return text.length - 1;
}

function extractStateFields(stateBody: string): StateField[] {
  const fields: StateField[] = [];
  const fieldRegex = /^\s*(final\s+)?(\w+(<[\w\s,<>]+>)?)\s+(\w+)\s*=\s*([^;]+);/gm;
  const skipLifecycle = /initState|dispose|didChangeDependencies|didUpdateWidget/;

  let match;
  while ((match = fieldRegex.exec(stateBody)) !== null) {
    const fullMatch = match[0];
    const type = match[2];
    const name = match[4];
    const defaultValue = match[5].trim();
    if (!skipLifecycle.test(fullMatch) && name !== 'build' && name !== 'createState') {
      fields.push({ declaration: fullMatch, name, type, defaultValue });
    }
  }

  const finalFieldRegex = /^\s*(?:late\s+)?final\s+(\w+(<[\w\s,<>]+>)?)\s+(\w+)\s*;\s*$/gm;
  while ((match = finalFieldRegex.exec(stateBody)) !== null) {
    const type = match[1];
    const name = match[3];
    if (!fields.some(f => f.name === name)) {
      fields.push({ declaration: match[0].trim(), name, type, defaultValue: '' });
    }
  }

  return fields;
}

function extractBuildMethodBody(stateBody: string): string {
  const buildRegex = /(?:@override\s+)?Widget\s+build\s*\(\s*BuildContext\s+\w+\s*\)\s*\{/;
  const match = buildRegex.exec(stateBody);
  if (!match) { return ''; }

  const braceStart = match.index + match[0].length - 1;
  const braceEnd = findMatchingBrace(stateBody, braceStart);
  return stateBody.substring(braceStart + 1, braceEnd).trim();
}

function findStateClass(text: string, widgetName: string, widgetIndex: number): StateClass | null {
  const patterns = [
    new RegExp(`class\\s+_${widgetName}State\\s+extends\\s+State<${widgetName}>\\s*\\{`),
    new RegExp(`class\\s+_${widgetName}State\\s+extends\\s+State<${widgetName}>\\s*\\{`),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const classStart = match.index;
      const bodyStart = match.index + match[0].length - 1;
      const bodyEnd = findMatchingBrace(text, bodyStart);
      const fullMatch = text.substring(classStart, bodyEnd + 1);
      const stateBody = text.substring(bodyStart + 1, bodyEnd);

      return {
        fullMatch,
        name: `_${widgetName}State`,
        widgetName,
        buildMethodBody: extractBuildMethodBody(stateBody),
        stateFields: extractStateFields(stateBody),
        hasSetState: /\bsetState\s*\(/.test(stateBody),
        hasInitState: /void\s+initState\s*\(/.test(stateBody),
        hasDispose: /void\s+dispose\s*\(/.test(stateBody),
        hasDidChangeDependencies: /void\s+didChangeDependencies\s*\(/.test(stateBody),
        hasDidUpdateWidget: /void\s+didUpdateWidget\s*\(/.test(stateBody),
        startOffset: classStart,
        endOffset: bodyEnd + 1,
      };
    }
  }

  return null;
}

export function parseFile(text: string): ParsedFile {
  const imports: string[] = [];
  let match;

  const importRegex = new RegExp(IMPORT_REGEX.source, 'gm');
  while ((match = importRegex.exec(text)) !== null) {
    imports.push(match[0]);
  }

  const widgets: WidgetClass[] = [];
  const widgetOffsets: number[] = [];

  const classRegex = new RegExp(CLASS_REGEX.source, 'gm');
  while ((match = classRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const startOffset = match.index;
    const isPrivate = match[1] === '_';
    const name = match[2];
    const baseClass = match[3];
    const isStatefulWidget = STATEFUL_WIDGET_RE.test(fullMatch);

    widgets.push({
      matchIndex: widgets.length,
      fullMatch,
      isPrivate,
      name,
      baseClass,
      isStatefulWidget,
      startOffset,
      endOffset: startOffset + fullMatch.length,
    });
    widgetOffsets.push(startOffset);
  }

  const stateMap = new Map<number, StateClass>();
  for (let i = 0; i < widgets.length; i++) {
    const w = widgets[i];
    if (w.isStatefulWidget) {
      const sc = findStateClass(text, w.name, w.startOffset);
      if (sc) {
        stateMap.set(i, sc);
      }
    }
  }

  return { imports, widgets, stateMap };
}

export function isStatefulWidget(widget: WidgetClass): boolean {
  return STATEFUL_WIDGET_RE.test(widget.fullMatch);
}

export function isStatelessWidget(widget: WidgetClass): boolean {
  return STATELESS_WIDGET_RE.test(widget.fullMatch);
}
