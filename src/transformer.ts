import { WidgetClass } from './parser';

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
  return content.replace(classRefRegex, newClassName);
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
