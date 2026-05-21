import { WidgetClass } from './parser';

export function pascalToSnake(className: string): string {
  return className
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

export function adjustImports(imports: string[], levelUp: boolean = true): string[] {
  return imports.map(imp => {
    if (imp.includes('package:')) {
      return imp;
    }
    if (!levelUp) {
      return imp;
    }
    if (imp.includes("import '")) {
      return imp.replace("import '", "import '../");
    }
    if (imp.includes('import "')) {
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
  const lastImportIndex = content.lastIndexOf('import');
  if (lastImportIndex === -1) {
    return newImports.join('\n') + '\n\n' + content;
  }
  const lastImportEndIndex = content.indexOf('\n', lastImportIndex) + 1;
  return content.slice(0, lastImportEndIndex) + newImports.join('\n') + '\n\n' + content.slice(lastImportEndIndex);
}

export function cleanBlankLines(content: string): string {
  return content.replace(/^\s*\n/gm, '').replace(/\n*$/, '\n');
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
