import { WidgetClass } from './parser';

// Find all string literal and comment regions in Dart code
function findProtectedRegions(text: string): Array<{ start: number; end: number }> {
  const regions: Array<{ start: number; end: number }> = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    const next = i + 1 < text.length ? text[i + 1] : '';

    // Line comment
    if (ch === '/' && next === '/') {
      const start = i;
      let j = i + 2;
      while (j < text.length && text[j] !== '\n') { j++; }
      regions.push({ start, end: j });
      i = j;
      continue;
    }

    // Block comment
    if (ch === '/' && next === '*') {
      const start = i;
      let j = i + 2;
      while (j < text.length - 1) {
        if (text[j] === '*' && text[j + 1] === '/') {
          regions.push({ start, end: j + 2 });
          i = j + 2;
          break;
        }
        j++;
      }
      if (j >= text.length - 1) {
        regions.push({ start, end: text.length });
        i = text.length;
      }
      continue;
    }

    // Raw string: r"..." or r'...'
    if (ch === 'r' && (next === '"' || next === "'")) {
      const quote = next;
      const start = i;
      let j = i + 2;
      while (j < text.length) {
        if (text[j] === quote) {
          regions.push({ start, end: j + 1 });
          i = j + 1;
          break;
        }
        j++;
      }
      if (j >= text.length) {
        regions.push({ start, end: text.length });
        i = text.length;
      }
      continue;
    }

    // Triple-quoted string
    if ((ch === '"' || ch === "'") && next === ch && i + 2 < text.length && text[i + 2] === ch) {
      const start = i;
      let j = i + 3;
      while (j < text.length - 2) {
        if (text[j] === ch && text[j + 1] === ch && text[j + 2] === ch) {
          regions.push({ start, end: j + 3 });
          i = j + 3;
          break;
        }
        j++;
      }
      if (j >= text.length - 2) {
        regions.push({ start, end: text.length });
        i = text.length;
      }
      continue;
    }

    // Single-quoted string
    if (ch === '"' || ch === "'") {
      const start = i;
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
        if (text[j] === ch) {
          regions.push({ start, end: j + 1 });
          i = j + 1;
          break;
        }
        j++;
      }
      if (j >= text.length) {
        regions.push({ start, end: text.length });
        i = text.length;
      }
      continue;
    }

    i++;
  }

  return regions;
}

// Check if a position is inside any protected region
function isProtected(pos: number, regions: Array<{ start: number; end: number }>): boolean {
  for (const r of regions) {
    if (pos >= r.start && pos < r.end) {
      return true;
    }
  }
  return false;
}

/**
 * Replace a pattern globally, but only outside of Dart string literals and comments.
 * This prevents accidental replacements inside string values and comments.
 * @param replacer A function that receives the RegExp match array and returns the replacement string.
 */
export function safeReplace(
  text: string,
  pattern: RegExp,
  replacer: (match: RegExpExecArray) => string
): string {
  const regions = findProtectedRegions(text);
  let result = '';
  let lastIndex = 0;

  // We need to scan manually because we skip matches in protected regions
  const globalPattern = new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'
  );
  let match: RegExpExecArray | null;

  while ((match = globalPattern.exec(text)) !== null) {
    if (!isProtected(match.index, regions)) {
      result += text.substring(lastIndex, match.index) + replacer(match);
      lastIndex = match.index + match[0].length;
    }
    // Reset lastIndex manually for the next iteration
    if (match.index === globalPattern.lastIndex) {
      globalPattern.lastIndex++;
    }
  }

  result += text.substring(lastIndex);
  return result;
}

export function pascalToSnake(className: string): string {
  return className
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

export function adjustImports(imports: string[], levelUp: boolean = true): string[] {
  return imports.map(imp => {
    // Keep package: and dart: imports unchanged
    if (imp.includes('package:') || imp.includes('dart:')) {
      return imp;
    }
    if (!levelUp) {
      return imp;
    }
    // Adjust relative imports by prepending ../
    if (imp.startsWith("import '")) {
      return imp.replace("import '", "import '../");
    }
    if (imp.startsWith('import "')) {
      return imp.replace('import "', 'import "../');
    }
    return imp;
  });
}

export function makeWidgetPublic(
  componentContent: string,
  oldClassName: string,
  className: string
): string {
  let content = componentContent.replace(`class ${oldClassName}`, `class ${className}`);

  const constructorRegex = new RegExp(`const\\s+${oldClassName}\\s*\\(`, 'g');
  content = content.replace(constructorRegex, `const ${className}(`);

  return content;
}

export function updateReferencesInFile(
  content: string,
  oldClassName: string,
  newClassName: string
): string {
  const classRefRegex = new RegExp(`\\b${oldClassName}\\b`, 'g');
  return safeReplace(content, classRefRegex, () => newClassName);
}

export function insertImportsAfterExisting(
  content: string,
  newImports: string[]
): string {
  if (newImports.length === 0) {
    return content;
  }

  // Find all actual import lines (not inside strings or comments)
  const importRegex = /^import\s+['"].*['"];\s*$/gm;
  const matches: RegExpExecArray[] = [];
  let m;
  while ((m = importRegex.exec(content)) !== null) {
    matches.push(m);
  }

  if (matches.length === 0) {
    // No existing imports — prepend at top
    return newImports.join('\n') + '\n\n' + content;
  }

  // Insert after the last import line
  const lastMatch = matches[matches.length - 1];
  const insertPos = lastMatch.index + lastMatch[0].length;
  return content.slice(0, insertPos) + '\n' + newImports.join('\n') + content.slice(insertPos);
}

export function cleanBlankLines(content: string): string {
  // Strip leading blank lines
  const noLeading = content.replace(/^\s*\n+/, '');
  // Collapse 3+ consecutive blank lines to 2
  const collapsed = noLeading.replace(/\n{4,}/g, '\n\n\n');
  // Ensure single trailing newline
  return collapsed.replace(/\n*$/, '\n');
}

export function stripClassFromContent(
  content: string,
  fullClassMatch: string
): string {
  return content.replace(fullClassMatch, '');
}

export function wrapWithImports(
  componentContent: string,
  imports: string[]
): string {
  return imports.join('\n') + '\n\n' + componentContent;
}
