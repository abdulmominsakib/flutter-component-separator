# Flutter Component Separator

## Overview

Flutter Component Separator is a Visual Studio Code extension designed to streamline the organization of Flutter widget files. It provides three powerful refactoring operations for Dart files:

1. **Separate Components** — Extract widget classes into individual files
2. **Convert to StatelessWidget** — Transform StatefulWidget classes into StatelessWidget with constructor parameters
3. **Full Refactor** — Run both operations together with an interactive preview

## Features

- **Lightbulb Code Actions**: Place your cursor on any widget class and see quick-fix suggestions
- **Context Menus**: Right-click any `.dart` file in the Explorer or Editor to access refactoring commands
- **Interactive Preview**: Review all changes in a diff viewer before applying
- **Status Bar Widget Counter**: See at a glance how many widgets and stateful widgets are in the current file
- **Configurable**: Customize the default operation and components folder name via settings
- Automatically identifies the main widget in a Flutter file
- Separates other widget classes into individual files
- Creates a `components` folder to store separated widgets
- Updates import statements in the main file
- Works with any Flutter file structure

## Installation

1. Open Visual Studio Code
2. Go to the Extensions view (Ctrl+Shift+X or Cmd+Shift+X)
3. Search for "Flutter Component Separator"
4. Click on the "Install" button

Alternatively, you can install the extension from the Visual Studio Code Marketplace.

## Usage

### Code Actions (Lightbulb)

Place your cursor on any widget class in a Dart file. VS Code will show a lightbulb icon with contextual refactoring actions:
- 💡 **Separate this widget into components**
- 💡 **Convert this StatefulWidget to StatelessWidget**
- 💡 **Full Refactor**

### Context Menus

**Explorer:** Right-click any `.dart` file → Flutter: Separate Components / Convert to Stateless / Full Refactor

**Editor:** Right-click inside a Dart file → Same options

**Editor Title Bar:** A sparkle icon appears when a `.dart` file is open — click it to run Full Refactor.

### Command Palette

1. Open a Flutter file containing multiple widget classes
2. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
3. Type and select one of:
   - "Flutter: Separate Components into Files"
   - "Flutter: Convert StatefulWidget to StatelessWidget"
   - "Flutter: Full Refactor (Interactive Preview)"
4. The extension will show a diff preview. Review the changes, then click **Apply** or **Cancel**.

## Example

Before:
```dart
// main_screen.dart
class MainScreen extends StatelessWidget {
  // ...
}

class Header extends StatelessWidget {
  // ...
}

class Footer extends StatelessWidget {
  // ...
}
```

After running the extension:

```dart
// main_screen.dart
import 'components/header.dart';
import 'components/footer.dart';

class MainScreen extends StatelessWidget {
  // ...
}
```

```dart
// components/header.dart
class Header extends StatelessWidget {
  // ...
}
```

```dart
// components/footer.dart
class Footer extends StatelessWidget {
  // ...
}
```

## Settings

Open **Settings** → search for "Flutter Component Separator" to customize:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `flutterComponentSeparator.defaultOperation` | enum | `"ask"` | Default operation: `ask`, `separate`, `convert`, or `refactor` |
| `flutterComponentSeparator.componentsFolderName` | string | `"components"` | Folder name for separated component files |
| `flutterComponentSeparator.showStatusBar` | boolean | `true` | Show status bar item when a Dart file with widgets is active |

## Requirements

- Visual Studio Code 1.60.0 or higher
- Flutter extension for Visual Studio Code (recommended but not required)

## Known Issues

- The extension does not handle custom State class names (expects `_WidgetNameState` convention)
- String literal replacement may affect text inside string values when converting StatefulWidget to StatelessWidget
- The extension does not handle nested classes or classes defined inside functions

## Contributing

Contributions to the Flutter Component Separator extension are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any problems or have any suggestions, please open an issue on the [GitHub repository](https://github.com/abdulmominsakib/flutter-component-separator).

Enjoy using Flutter Component Separator!