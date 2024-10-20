// extension.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
	let disposable = vscode.commands.registerCommand('extension.separateFlutterComponents', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor!');
			return;
		}

		const document = editor.document;
		const fullText = document.getText();
		const fileName = path.basename(document.fileName);
		const dirName = path.dirname(document.fileName);

		// Create components directory if it doesn't exist
		const componentsDir = path.join(dirName, 'components');
		if (!fs.existsSync(componentsDir)) {
			fs.mkdirSync(componentsDir);
		}

		// Regular expression to match class definitions
		const classRegex = /class\s+(_?)(\w+)\s+extends\s+\w+\s*{[\s\S]*?^\}$/gm;
		// Regular expression to match import statements
		const importRegex = /^import\s+['"]([^'"]+)['"];?\s*$/gm;

		let match;
		let newImports: string[] = [];
		let mainFileContent = fullText;
		let isFirstWidget = true;
		let mainWidgetName = '';
		let existingImports: string[] = [];

		// Extract existing imports
		while ((match = importRegex.exec(fullText)) !== null) {
			existingImports.push(match[0]);
		}

		// Store all matches first
		let matches = [];
		while ((match = classRegex.exec(fullText)) !== null) {
			matches.push(match);
		}

		for (let match of matches) {
			const isPrivate = match[1] === '_';
			let className = match[2];
			let componentContent = match[0];
			const fullMatch = match[0];

			if (isFirstWidget) {
				// Assume the first widget is the main one
				isFirstWidget = false;
				mainWidgetName = className;
				continue;
			}

			// Remove component from main file before any modifications
			mainFileContent = mainFileContent.replace(fullMatch, '');

			if (isPrivate) {
				const makePublic = await vscode.window.showQuickPick(['Yes', 'No'], {
					placeHolder: `Make private widget ${className} public?`
				});

				if (makePublic === 'Yes') {
					const oldClassName = `_${className}`;
					className = className; // Remove underscore
					componentContent = componentContent.replace(`class ${oldClassName}`, `class ${className}`);

					// Update constructor
					const constructorRegex = new RegExp(`const\\s+_${className}\\s*\\(`, 'g');
					componentContent = componentContent.replace(constructorRegex, `const ${className}(`);

					// Update references in the main file content
					const classRefRegex = new RegExp(`\\b${oldClassName}\\b`, 'g');
					mainFileContent = mainFileContent.replace(classRefRegex, className);
				}
			}

			const componentFileName = `${className.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()}.dart`;
			const componentFilePath = path.join(componentsDir, componentFileName);

			// Adjust relative imports
			const adjustedImports = existingImports.map(imp => {
				if (imp.includes("import '") && !imp.includes("import 'package:")) {
					return imp.replace("import '", "import '../");
				}
				return imp;
			});

			// Combine adjusted imports and component content
			let fullComponentContent = adjustedImports.join('\n') + '\n\n' + componentContent;

			// Write component to new file
			fs.writeFileSync(componentFilePath, fullComponentContent);

			// Add import statement to main file
			newImports.push(`import 'components/${componentFileName}';`);
		}

		// Add new imports to the top of the file, after existing imports
		const lastImportIndex = mainFileContent.lastIndexOf('import');
		const lastImportEndIndex = mainFileContent.indexOf('\n', lastImportIndex) + 1;
		mainFileContent = mainFileContent.slice(0, lastImportEndIndex) + newImports.join('\n') + '\n\n' + mainFileContent.slice(lastImportEndIndex);

		// Remove any empty lines at the beginning and end of the file
		mainFileContent = mainFileContent.replace(/^\s*\n/gm, '').replace(/\n*$/, '\n');

		// Write updated content back to the main file
		fs.writeFileSync(document.fileName, mainFileContent);

		vscode.window.showInformationMessage(`Flutter components have been separated! Main widget: ${mainWidgetName}`);
	});

	context.subscriptions.push(disposable);
}

export function deactivate() { }