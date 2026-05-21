import { StateClass, WidgetClass } from './parser';

export interface ConversionResult {
  newContent: string;
  warnings: string[];
  originalWidgetName: string;
}

function indentBlock(code: string, spaces: number): string {
  const indent = ' '.repeat(spaces);
  return code.split('\n').map(line => line ? indent + line : line).join('\n');
}

function buildConstructorParams(fields: Array<{ name: string; type: string }>): string {
  if (fields.length === 0) { return 'super.key'; }

  const params = fields.map(f => `required this.${f.name}`);
  return `super.key, ${params.join(', ')}`;
}

function buildConstructorFields(fields: Array<{ name: string; type: string }>): string {
  return fields.map(f => `  final ${f.type} ${f.name};`).join('\n');
}

function replaceWidgetPrefix(buildBody: string, widgetName: string): string {
  return buildBody.replace(/widget\.(\w+)/g, (_full: string, prop: string) => prop);
}

function stripLifecycleComments(state: StateClass): string {
  const comments: string[] = [];
  if (state.hasSetState) {
    comments.push('// TODO: setState() calls were removed - ensure parent handles state updates');
  }
  if (state.hasInitState) {
    comments.push('// TODO: initState() was removed - move initialization to parent or constructor');
  }
  if (state.hasDispose) {
    comments.push('// TODO: dispose() was removed - move cleanup to parent widget lifecycle');
  }
  if (state.hasDidChangeDependencies) {
    comments.push('// TODO: didChangeDependencies() was removed - use parent or inherited widgets directly');
  }
  if (state.hasDidUpdateWidget) {
    comments.push('// TODO: didUpdateWidget() was removed - compare old/new values in parent');
  }
  return comments.length > 0 ? '\n  ' + comments.join('\n  ') + '\n' : '';
}

export function convertStatefulToStateless(
  widget: WidgetClass,
  state: StateClass
): ConversionResult {
  const warnings: string[] = [];
  const fieldsForConstructor = state.stateFields.map(f => ({ name: f.name, type: f.type }));

  if (state.hasSetState) {
    warnings.push('setState() calls detected - state management must be moved to parent');
  }
  if (state.hasInitState) {
    warnings.push('initState() override removed - move initialization to parent');
  }
  if (state.hasDispose) {
    warnings.push('dispose() override removed - move cleanup to parent');
  }
  if (state.hasDidChangeDependencies) {
    warnings.push('didChangeDependencies() override removed');
  }
  if (state.hasDidUpdateWidget) {
    warnings.push('didUpdateWidget() override removed');
  }
  if (state.stateFields.length > 0) {
    warnings.push(`${state.stateFields.length} state variable(s) converted to constructor parameters`);
  }

  let buildBody = state.buildMethodBody;
  buildBody = replaceWidgetPrefix(buildBody, widget.name);

  const commentsBlock = stripLifecycleComments(state);

  const constructorFields = buildConstructorFields(fieldsForConstructor);
  const constructorParams = buildConstructorParams(fieldsForConstructor);

  let newContent = '';
  newContent += `class ${widget.name} extends StatelessWidget {\n`;
  if (constructorFields) {
    newContent += `${constructorFields}\n\n`;
  }
  newContent += `  const ${widget.name}({${constructorParams}});\n\n`;
  newContent += `  @override\n`;
  newContent += `  Widget build(BuildContext context) {\n`;
  newContent += `${indentBlock(buildBody, 4)}\n`;
  newContent += `  }\n`;
  if (commentsBlock) {
    newContent += commentsBlock;
  }
  newContent += `}`;

  return {
    newContent,
    warnings,
    originalWidgetName: widget.name,
  };
}

export function replaceWidgetPairInContent(
  content: string,
  widget: WidgetClass,
  state: StateClass,
  newWidgetContent: string
): string {
  const earlier = Math.min(widget.startOffset, state.startOffset);
  const later = Math.max(widget.endOffset, state.endOffset);

  const before = content.substring(0, earlier);
  const after = content.substring(later);

  return before + newWidgetContent + after;
}
