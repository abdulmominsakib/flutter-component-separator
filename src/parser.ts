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

const CLASS_DECL_REGEX = /class\s+(_?)(\w+)\s+extends\s+([\w<>,\s]+?)\s*\{/gm;

const STATEFUL_WIDGET_RE = /extends\s+StatefulWidget\b/;
const STATELESS_WIDGET_RE = /extends\s+StatelessWidget\b/;

function skipString(text: string, i: number): number {
  const quote = text[i];
  let j = i + 1;
  let escaped = false;
  while (j < text.length) {
    if (escaped) {
      escaped = false;
      j++;
      continue;
    }
    if (text[j] === '\\') {
      escaped = true;
      j++;
      continue;
    }
    if (text[j] === quote) {
      return j + 1;
    }
    j++;
  }
  return text.length;
}

function skipRawString(text: string, i: number): number {
  // r"..." or r'...'
  const quote = text[i + 1];
  if (!quote || (quote !== '"' && quote !== "'")) { return i + 1; }
  let j = i + 2;
  while (j < text.length) {
    if (text[j] === quote) {
      return j + 1;
    }
    j++;
  }
  return text.length;
}

function skipTripleQuotedString(text: string, i: number): number {
  const quote = text[i];
  if (text[i + 1] !== quote || text[i + 2] !== quote) { return i + 1; }
  let j = i + 3;
  while (j < text.length - 2) {
    if (text[j] === quote && text[j + 1] === quote && text[j + 2] === quote) {
      return j + 3;
    }
    j++;
  }
  return text.length;
}

function skipLineComment(text: string, i: number): number {
  let j = i + 2;
  while (j < text.length && text[j] !== '\n') {
    j++;
  }
  return j;
}

function skipBlockComment(text: string, i: number): number {
  let j = i + 2;
  while (j < text.length - 1) {
    if (text[j] === '*' && text[j + 1] === '/') {
      return j + 2;
    }
    j++;
  }
  return text.length;
}

export function findMatchingBrace(text: string, startIndex: number): number {
  let depth = 0;
  let i = startIndex;
  while (i < text.length) {
    const ch = text[i];

    // Skip strings
    if (ch === '"' || ch === "'") {
      // Check for triple-quoted
      if (i + 2 < text.length && text[i + 1] === ch && text[i + 2] === ch) {
        i = skipTripleQuotedString(text, i);
        continue;
      }
      // Check for raw string
      if (i > 0 && text[i - 1] === 'r') {
        i = skipRawString(text, i - 1);
        continue;
      }
      i = skipString(text, i);
      continue;
    }

    // Skip comments
    if (ch === '/' && i + 1 < text.length) {
      const next = text[i + 1];
      if (next === '/') {
        i = skipLineComment(text, i);
        continue;
      }
      if (next === '*') {
        i = skipBlockComment(text, i);
        continue;
      }
    }

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
    i++;
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
  const pattern = new RegExp(`class\\s+__?${widgetName}State\\s+extends\\s+State<_?${widgetName}>\\s*\\{`);

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

  const classDeclRegex = new RegExp(CLASS_DECL_REGEX.source, 'gm');
  while ((match = classDeclRegex.exec(text)) !== null) {
    const startOffset = match.index;
    const bodyStart = match.index + match[0].length - 1; // position of '{'
    const bodyEnd = findMatchingBrace(text, bodyStart);
    const fullMatch = text.substring(startOffset, bodyEnd + 1);
    const isPrivate = match[1] === '_';
    const name = match[2];
    const baseClass = match[3].trim();
    const isStatefulWidget = STATEFUL_WIDGET_RE.test(fullMatch);

    widgets.push({
      matchIndex: widgets.length,
      fullMatch,
      isPrivate,
      name,
      baseClass,
      isStatefulWidget,
      startOffset,
      endOffset: bodyEnd + 1,
    });
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

export function detectDependencies(
  widgets: WidgetClass[],
  stateMap: Map<number, StateClass>
): Map<number, number[]> {
  const dependencyMap = new Map<number, number[]>();

  for (let i = 0; i < widgets.length; i++) {
    const w = widgets[i];
    if (w.baseClass.startsWith('State<')) {
      continue;
    }
    let totalText = w.fullMatch;
    const state = stateMap.get(i);
    if (state) {
      totalText += '\n' + state.fullMatch;
    }

    const dependencies: number[] = [];
    for (let j = 0; j < widgets.length; j++) {
      if (i === j) { continue; }
      const other = widgets[j];
      if (other.baseClass.startsWith('State<')) {
        continue;
      }
      const pattern = new RegExp(`\\b_?${other.name}\\b`);
      if (pattern.test(totalText)) {
        dependencies.push(j);
      }
    }
    dependencyMap.set(i, dependencies);
  }

  return dependencyMap;
}

export function expandTransitiveDependencies(
  selectedIndices: Set<number>,
  widgets: WidgetClass[],
  deps: Map<number, number[]>
): Set<number> {
  const finalSeparatedIndices = new Set<number>(selectedIndices);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < widgets.length; i++) {
      const w = widgets[i];
      if (w.baseClass.startsWith('State<')) {
        continue;
      }
      if (finalSeparatedIndices.has(i)) {
        continue;
      }
      const widgetDeps = deps.get(i) || [];
      for (const depIdx of widgetDeps) {
        if (finalSeparatedIndices.has(depIdx)) {
          finalSeparatedIndices.add(i);
          changed = true;
          break;
        }
      }
    }
  }
  return finalSeparatedIndices;
}

