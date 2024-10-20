# Flutter Component Separator

## Overview

Flutter Component Separator is a Visual Studio Code extension designed to streamline the organization of Flutter widget files. It automatically separates component classes into individual files, making your Flutter projects more modular and easier to maintain.

## Features

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

1. Open a Flutter file containing multiple widget classes
2. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
3. Type and select "Separate Flutter Components"
4. The extension will process the file:
   - The first widget class encountered will be considered the main widget and will remain in the original file
   - All other widget classes will be moved to separate files in a new `components` folder
   - Import statements will be updated in the main file

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

## Requirements

- Visual Studio Code 1.60.0 or higher
- Flutter extension for Visual Studio Code

## Known Issues

- The extension currently does not handle nested classes or classes defined inside functions
- It may not correctly process files with complex string literals containing code-like content

## Contributing

Contributions to the Flutter Component Separator extension are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any problems or have any suggestions, please open an issue on the [GitHub repository](https://github.com/yourusername/flutter-component-separator).

Enjoy using Flutter Component Separator!