import {
  pascalToSnake,
  adjustImports,
  makeWidgetPublic,
  updateReferencesInFile,
  insertImportsAfterExisting,
  cleanBlankLines,
  stripClassFromContent,
  wrapWithImports,
} from '../transformer';
import {
  assertEqual,
  assertContains,
  assertNotContains,
  runSuite,
} from './utils';

export async function runTransformerTests(): Promise<void> {
  await runSuite('Transformer Tests', [

    // ─── pascalToSnake ───────────────────────────────────────────────
    ['converts PascalCase to snake_case', () => {
      assertEqual(pascalToSnake('CustomHeader'), 'custom_header', 'simple PascalCase');
      assertEqual(pascalToSnake('AppBarWidget'), 'app_bar_widget', 'two conversions');
      assertEqual(pascalToSnake('FancyAppBarWidget'), 'fancy_app_bar_widget', 'three words');
      assertEqual(pascalToSnake('someWidget'), 'some_widget', 'lowercase start');
      assertEqual(pascalToSnake('JSONParser'), 'json_parser', 'consecutive uppercase then lowercase');
      assertEqual(pascalToSnake('HTTPSClient'), 'https_client', 'long uppercase prefix');
    }],

    ['handles edge cases in pascalToSnake', () => {
      assertEqual(pascalToSnake('A'), 'a', 'single char');
      assertEqual(pascalToSnake('Ab'), 'ab', 'two chars start uppercase');
      assertEqual(pascalToSnake('abc'), 'abc', 'all lowercase');
      assertEqual(pascalToSnake('UI'), 'ui', 'two uppercase');
      assertEqual(pascalToSnake('ABC'), 'abc', 'all uppercase');
      assertEqual(pascalToSnake(''), '', 'empty string');
    }],

    // ─── adjustImports ───────────────────────────────────────────────
    ['prepends ../ to relative imports (levelUp=true)', () => {
      const imports = [
        "import 'widgets/button.dart';",
        "import 'package:flutter/material.dart';",
        "import 'models/user.dart';",
      ];
      const result = adjustImports(imports, true);
      assertContains(result[0], "import '../widgets/button.dart'", 'relative path adjusted');
      assertContains(result[1], "import 'package:flutter/material.dart'", 'package import unchanged');
      assertContains(result[2], "import '../models/user.dart'", 'second relative adjusted');
    }],

    ['leaves all imports unchanged when levelUp=false', () => {
      const imports = [
        "import 'widgets/button.dart';",
        "import 'package:flutter/material.dart';",
      ];
      const result = adjustImports(imports, false);
      assertContains(result[0], "import 'widgets/button.dart'", 'relative unchanged');
      assertContains(result[1], "import 'package:flutter/material.dart'", 'package unchanged');
    }],

    ['handles empty imports array', () => {
      const result = adjustImports([], true);
      assertEqual(result.length, 0, 'empty array returned');
    }],

    ['handles imports with double quotes', () => {
      const imports = [
        'import "widgets/button.dart";',
        'import "package:flutter/material.dart";',
      ];
      const result = adjustImports(imports, true);
      assertContains(result[0], 'import "../widgets/button.dart"', 'double quote adjusted');
      assertContains(result[1], 'import "package:flutter/material.dart"', 'package unchanged');
    }],

    // ─── makeWidgetPublic ────────────────────────────────────────────
    ['renames private class to public', () => {
      const content = 'class _CustomHeader extends StatelessWidget {\n  const _CustomHeader({required this.title});\n}';
      const result = makeWidgetPublic(content, '_CustomHeader', 'CustomHeader');
      assertContains(result, 'class CustomHeader', 'class definition renamed');
      assertNotContains(result, 'class _CustomHeader', 'old class name removed');
    }],

    ['renames private constructor to public', () => {
      const content = 'class _MyButton extends StatelessWidget {\n  const _MyButton({super.key});\n}';
      const result = makeWidgetPublic(content, '_MyButton', 'MyButton');
      assertContains(result, 'const MyButton(', 'constructor renamed');
      assertNotContains(result, 'const _MyButton(', 'old constructor removed');
    }],

    ['handles class with no constructor call', () => {
      const content = 'class _NoConstructor extends StatelessWidget {\n  @override\n  Widget build(BuildContext context) { return Text(""); }\n}';
      const result = makeWidgetPublic(content, '_NoConstructor', 'NoConstructor');
      assertContains(result, 'class NoConstructor', 'class renamed');
      assertNotContains(result, 'class _NoConstructor', 'old class gone');
    }],

    // ─── updateReferencesInFile ──────────────────────────────────────
    ['replaces all references to a private class', () => {
      const content = `
class MainPage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(children: [
      _CustomHeader(title: 'Hi'),
      _CustomHeader(title: 'Bye'),
    ]);
  }
}
`;
      const result = updateReferencesInFile(content, '_CustomHeader', 'CustomHeader');
      assertContains(result, 'CustomHeader(title:', 'reference updated');
      assertNotContains(result, '_CustomHeader(', 'old reference removed');
      assertEqual(
        (result.match(/CustomHeader/g) || []).length,
        2,
        'two references updated'
      );
    }],

    ['does not replace partial matches', () => {
      const content = 'class _Foo { } class __FooBar { }';
      const result = updateReferencesInFile(content, '_Foo', 'Foo');
      assertContains(result, 'class Foo {', 'exact match replaced');
      assertContains(result, '__FooBar', 'partial match unchanged');
    }],

    // ─── insertImportsAfterExisting ──────────────────────────────────
    ['inserts new imports after last existing import', () => {
      const content = `
import 'package:flutter/material.dart';
import 'package:my_app/models/user.dart';

class HomePage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Text('Home');
  }
}
`;
      const newImports = [
        "import 'components/custom_header.dart';",
        "import 'components/my_button.dart';",
      ];
      const result = insertImportsAfterExisting(content, newImports);
      assertContains(result, "import 'components/custom_header.dart'", 'first new import present');
      assertContains(result, "import 'components/my_button.dart'", 'second new import present');

      const lines = result.split('\n');
      const importLines = lines.map((l, i) => ({ line: l, idx: i })).filter(x => x.line.includes("import '"));
      assertEqual(importLines.length, 4, 'total four imports');
    }],

    ['prefixes with imports when no existing imports exist', () => {
      const content = `
class HomePage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Text('Home');
  }
}
`;
      const newImports = ["import 'package:flutter/material.dart';"];
      const result = insertImportsAfterExisting(content, newImports);
      assertContains(result, "import 'package:flutter/material.dart';", 'import added');
      assertContains(result, 'class HomePage', 'class still present after import');
    }],

    // ─── cleanBlankLines ─────────────────────────────────────────────
    ['removes leading and trailing blank lines', () => {
      const content = '\n\n\nimport "package:flutter/material.dart";\n\nclass Foo {}\n\n\n';
      const result = cleanBlankLines(content);
      assertTrue(result.startsWith('import'), 'no leading blank lines');
      assertTrue(result.endsWith('}\n'), 'ends with one newline');
    }],

    ['preserves content when clean', () => {
      const content = 'import "a.dart";\nclass Foo {}\n';
      const result = cleanBlankLines(content);
      assertEqual(result, content, 'unchanged when already clean');
    }],

    // ─── stripClassFromContent ───────────────────────────────────────
    ['removes exact class match from content', () => {
      const classText = 'class FooBar extends StatelessWidget {\n  const FooBar({super.key});\n}';
      const content = `import 'a.dart';\n\n${classText}\n\nclass MainWidget extends StatelessWidget {\n  @override\n  Widget build(BuildContext context) {\n    return FooBar();\n  }\n}`;
      const result = stripClassFromContent(content, classText);
      assertNotContains(result, 'class FooBar extends StatelessWidget', 'class removed');
      assertContains(result, 'MainWidget', 'main widget remains');
      assertContains(result, 'return FooBar();', 'reference remains');
    }],

    // ─── wrapWithImports ─────────────────────────────────────────────
    ['wraps component content with imports', () => {
      const imports = [
        "import 'package:flutter/material.dart';",
      ];
      const component = 'class MyWidget extends StatelessWidget {\n}';
      const result = wrapWithImports(component, imports);
      assertContains(result, "import 'package:flutter/material.dart'", 'import present');
      assertContains(result, 'class MyWidget', 'component present');
      assertTrue(result.indexOf('import') < result.indexOf('class'), 'imports come before class');
    }],

    ['handles empty imports when wrapping', () => {
      const component = 'class MyWidget extends StatelessWidget {\n}';
      const result = wrapWithImports(component, []);
      assertEqual(result, '\n\nclass MyWidget extends StatelessWidget {\n}', 'empty imports produce blank prefix');
    }],

    // ─── Integration: adjustImports + makeWidgetPublic ───────────────
    ['full transform pipeline on a private widget', () => {
      const classContent = 'class _MyButton extends StatelessWidget {\n  const _MyButton({super.key});\n  @override\n  Widget build(BuildContext context) {\n    return Text("Hi");\n  }\n}';
      const imports = ["import 'package:flutter/material.dart';"];

      let content = makeWidgetPublic(classContent, '_MyButton', 'MyButton');
      content = wrapWithImports(content, adjustImports(imports, true));

      assertContains(content, 'class MyButton', 'public class name');
      assertContains(content, 'const MyButton(', 'public constructor');
      assertContains(content, "import 'package:flutter/material.dart'", 'package import preserved unchanged');
    }],
  ]);
}

function assertTrue(value: boolean, message: string): void {
  assertEqual(value, true, message);
}
