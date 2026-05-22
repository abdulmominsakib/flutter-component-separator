import { parseFile, WidgetClass, StateClass, detectDependencies, expandTransitiveDependencies } from '../parser';
import {
  assertEqual,
  assertTrue,
  assertNotNull,
  assertContains,
  assertNotContains,
  assertGreaterThan,
  runSuite,
} from './utils';

export async function runParserTests(): Promise<void> {
  await runSuite('Parser Tests', [

    // ─── Basic class detection ───────────────────────────────────────
    ['detects a single StatelessWidget', () => {
      const text = `
import 'package:flutter/material.dart';

class MyWidget extends StatelessWidget {
  const MyWidget({super.key});

  @override
  Widget build(BuildContext context) {
    return Text('Hello');
  }
}
`;
      const result = parseFile(text);
      assertEqual(result.widgets.length, 1, 'finds one widget');
      assertEqual(result.widgets[0].name, 'MyWidget', 'extracts widget name');
      assertEqual(result.widgets[0].baseClass, 'StatelessWidget', 'detects base class');
      assertTrue(!result.widgets[0].isPrivate, 'is not private');
      assertTrue(!result.widgets[0].isStatefulWidget, 'is not StatefulWidget');
    }],

    ['detects a StatefulWidget', () => {
      const text = `
import 'package:flutter/material.dart';

class CounterWidget extends StatefulWidget {
  const CounterWidget({super.key});

  @override
  State<CounterWidget> createState() => _CounterWidgetState();
}

class _CounterWidgetState extends State<CounterWidget> {
  @override
  Widget build(BuildContext context) {
    return Text('Count');
  }
}
`;
      const result = parseFile(text);
      assertEqual(result.widgets.length, 2, 'finds two classes');
      assertTrue(result.widgets[0].isStatefulWidget, 'first is StatefulWidget');
      assertTrue(!result.widgets[1].isStatefulWidget, 'second is not StatefulWidget');
      assertNotNull(result.stateMap.get(0), 'State class found for widget at index 0');
    }],

    // ─── Private widget detection ────────────────────────────────────
    ['detects private widgets', () => {
      const text = `
import 'package:flutter/material.dart';

class MainWidget extends StatefulWidget {
  const MainWidget({super.key});
  @override
  State<MainWidget> createState() => _MainWidgetState();
}

class _MainWidgetState extends State<MainWidget> {
  @override
  Widget build(BuildContext context) {
    return _CustomHeader(title: 'Hi');
  }
}

class _CustomHeader extends StatelessWidget {
  final String title;
  const _CustomHeader({required this.title, super.key});

  @override
  Widget build(BuildContext context) {
    return Text(title);
  }
}
`;
      const result = parseFile(text);
      assertEqual(result.widgets.length, 3, 'finds three classes');
      assertTrue(result.widgets[2].isPrivate, 'third widget is private');
      assertEqual(result.widgets[2].name, 'CustomHeader', 'private name extracted without underscore');
    }],

    // ─── Multiple StatelessWidgets ───────────────────────────────────
    ['detects multiple StatelessWidgets', () => {
      const text = `
import 'package:flutter/material.dart';

class AppShell extends StatelessWidget {
  const AppShell({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBarWidget(),
      body: ContentWidget(),
      bottomNavigationBar: BottomNavWidget(),
    );
  }
}

class AppBarWidget extends StatelessWidget {
  const AppBarWidget({super.key});
  @override
  Widget build(BuildContext context) {
    return AppBar(title: Text('App'));
  }
}

class ContentWidget extends StatelessWidget {
  const ContentWidget({super.key});
  @override
  Widget build(BuildContext context) {
    return Center(child: Text('Content'));
  }
}

class BottomNavWidget extends StatelessWidget {
  const BottomNavWidget({super.key});
  @override
  Widget build(BuildContext context) {
    return BottomNavigationBar(items: []);
  }
}
`;
      const result = parseFile(text);
      assertEqual(result.widgets.length, 4, 'finds all four widgets');
      assertEqual(result.widgets[0].name, 'AppShell', 'first widget name');
      assertEqual(result.widgets[1].name, 'AppBarWidget', 'second widget name');
      assertEqual(result.widgets[2].name, 'ContentWidget', 'third widget name');
      assertEqual(result.widgets[3].name, 'BottomNavWidget', 'fourth widget name');
    }],

    // ─── Import extraction ───────────────────────────────────────────
    ['extracts all import statements', () => {
      const text = `
import 'package:flutter/material.dart';
import 'package:my_app/models/user.dart';
import 'widgets/custom_button.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});
  @override
  Widget build(BuildContext context) {
    return Text('Home');
  }
}
`;
      const result = parseFile(text);
      assertEqual(result.imports.length, 3, 'finds all three imports');
      assertContains(result.imports[0], 'package:flutter/material.dart', 'material import');
      assertContains(result.imports[1], 'package:my_app/models/user.dart', 'package import');
      assertContains(result.imports[2], "widgets/custom_button.dart", 'relative import');
    }],

    // ─── State class extraction ──────────────────────────────────────
    ['extracts State class with build method and fields', () => {
      const text = `
import 'package:flutter/material.dart';

class SettingsPage extends StatefulWidget {
  final User user;
  const SettingsPage({required this.user, super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  bool _isLoading = false;
  String _selectedTheme = 'light';

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  void _loadSettings() {
    setState(() {
      _isLoading = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('User: \${widget.user.name}'),
        Text('Theme: $_selectedTheme'),
        if (_isLoading) CircularProgressIndicator(),
      ],
    );
  }

  @override
  void dispose() {
    super.dispose();
  }
}
`;
      const result = parseFile(text);
      assertNotNull(result.stateMap.get(0), 'State class found');

      const state = result.stateMap.get(0)!;
      assertEqual(state.name, '_SettingsPageState', 'state class name');
      assertEqual(state.widgetName, 'SettingsPage', 'parent widget name');
      assertTrue(state.hasSetState, 'has setState call');
      assertTrue(state.hasInitState, 'has initState');
      assertTrue(state.hasDispose, 'has dispose');
      assertTrue(state.buildMethodBody.length > 0, 'build method body extracted');

      assertEqual(state.stateFields.length, 2, 'has two state fields');
      assertEqual(state.stateFields[0].name, '_isLoading', 'first field name');
      assertEqual(state.stateFields[0].type, 'bool', 'first field type');
      assertEqual(state.stateFields[0].defaultValue, 'false', 'first field default');
      assertEqual(state.stateFields[1].name, '_selectedTheme', 'second field name');
      assertEqual(state.stateFields[1].type, 'String', 'second field type');
      assertEqual(state.stateFields[1].defaultValue, "'light'", 'second field default');
    }],

    // ─── State class with didChangeDependencies and didUpdateWidget ──
    ['detects didChangeDependencies and didUpdateWidget', () => {
      const text = `
import 'package:flutter/material.dart';

class DataWidget extends StatefulWidget {
  const DataWidget({super.key});
  @override
  State<DataWidget> createState() => _DataWidgetState();
}

class _DataWidgetState extends State<DataWidget> {
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
  }

  @override
  void didUpdateWidget(covariant DataWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
  }

  @override
  Widget build(BuildContext context) {
    return Container();
  }
}
`;
      const result = parseFile(text);
      const state = result.stateMap.get(0)!;
      assertNotNull(state, 'state found');
      assertTrue(state.hasDidChangeDependencies, 'has didChangeDependencies');
      assertTrue(state.hasDidUpdateWidget, 'has didUpdateWidget');
      assertTrue(!state.hasSetState, 'no setState');
      assertTrue(!state.hasInitState, 'no initState');
    }],

    // ─── No State class for StatelessWidget ──────────────────────────
    ['returns no state for StatelessWidget', () => {
      const text = `
import 'package:flutter/material.dart';

class SimpleWidget extends StatelessWidget {
  const SimpleWidget({super.key});
  @override
  Widget build(BuildContext context) {
    return Text('Simple');
  }
}
`;
      const result = parseFile(text);
      assertTrue(!result.stateMap.has(0), 'no State class for StatelessWidget');
    }],

    // ─── late final fields in State ──────────────────────────────────
    ['extracts late final fields from State', () => {
      const text = `
import 'package:flutter/material.dart';

class FormPage extends StatefulWidget {
  const FormPage({super.key});
  @override
  State<FormPage> createState() => _FormPageState();
}

class _FormPageState extends State<FormPage> {
  late final TextEditingController _nameController;
  late final FocusNode _focusNode;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController();
    _focusNode = FocusNode();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(controller: _nameController);
  }
}
`;
      const result = parseFile(text);
      const state = result.stateMap.get(0)!;
      assertNotNull(state, 'state found');
      assertEqual(state.stateFields.length, 2, 'two late final fields');
      assertEqual(state.stateFields[0].name, '_nameController', 'controller field');
      assertEqual(state.stateFields[0].type, 'TextEditingController', 'controller type');
      assertEqual(state.stateFields[1].name, '_focusNode', 'focus node field');
      assertEqual(state.stateFields[1].type, 'FocusNode', 'focus node type');
    }],

    // ─── Empty file ──────────────────────────────────────────────────
    ['returns empty results for file with no widgets', () => {
      const text = `
import 'package:flutter/material.dart';

void someHelper() {
  print('helper');
}
`;
      const result = parseFile(text);
      assertEqual(result.widgets.length, 0, 'no widgets found');
      assertEqual(result.imports.length, 1, 'import found');
    }],

    // ─── Widget with generics in base class ──────────────────────────
    ['detects widget extending a generic class', () => {
      const text = `
import 'package:flutter/material.dart';

class GenericWidget extends ConsumerWidget {
  const GenericWidget({super.key});
  @override
  Widget build(BuildContext context) {
    return Text('Generic');
  }
}
`;
      const result = parseFile(text);
      assertEqual(result.widgets.length, 1, 'finds one widget');
      assertEqual(result.widgets[0].baseClass, 'ConsumerWidget', 'extracts base class name');
    }],

    // ─── Multiple StatefulWidgets with their States ──────────────────
    ['handles multiple StatefulWidget pairs', () => {
      const text = `
import 'package:flutter/material.dart';

class FormScreen extends StatefulWidget {
  const FormScreen({super.key});
  @override
  State<FormScreen> createState() => _FormScreenState();
}

class _FormScreenState extends State<FormScreen> {
  @override
  Widget build(BuildContext context) {
    return Column(children: []);
  }
}

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(body: Text('Dashboard'));
  }
}
`;
      const result = parseFile(text);
      assertEqual(result.widgets.length, 4, 'finds four classes');
      assertTrue(result.widgets[0].isStatefulWidget, 'first is StatefulWidget');
      assertTrue(result.widgets[2].isStatefulWidget, 'third is StatefulWidget');
      assertNotNull(result.stateMap.get(0), 'state for first');
      assertNotNull(result.stateMap.get(2), 'state for third');
    }],

    // ─── detectDependencies tests ─────────────────────────────────────
    ['detects dependencies between widgets correctly', () => {
      const text = `
class MainWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(children: [
      WidgetA(),
      _WidgetB(),
    ]);
  }
}

class WidgetA extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return _WidgetB();
  }
}

class _WidgetB extends StatefulWidget {
  @override
  State<_WidgetB> createState() => __WidgetBState();
}

class __WidgetBState extends State<_WidgetB> {
  @override
  Widget build(BuildContext context) {
    return WidgetC();
  }
}

class WidgetC extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Text('Hello');
  }
}
`;
      const parsed = parseFile(text);
      assertEqual(parsed.widgets.length, 5, 'five classes parsed including state classes');
      // Indices:
      // 0: MainWidget
      // 1: WidgetA
      // 2: WidgetB (isPrivate: true, name: WidgetB)
      // 3: _WidgetBState (State class)
      // 4: WidgetC

      const deps = detectDependencies(parsed.widgets, parsed.stateMap);

      // MainWidget depends on WidgetA and WidgetB
      const mainDeps = deps.get(0) || [];
      assertEqual(mainDeps.length, 2, 'MainWidget has 2 dependencies');
      assertTrue(mainDeps.includes(1), 'MainWidget depends on WidgetA');
      assertTrue(mainDeps.includes(2), 'MainWidget depends on WidgetB');

      // WidgetA depends on WidgetB
      const aDeps = deps.get(1) || [];
      assertEqual(aDeps.length, 1, 'WidgetA has 1 dependency');
      assertTrue(aDeps.includes(2), 'WidgetA depends on WidgetB');

      // WidgetB (State class build body references WidgetC) depends on WidgetC
      const bDeps = deps.get(2) || [];
      assertEqual(bDeps.length, 1, 'WidgetB has 1 dependency');
      assertTrue(bDeps.includes(4), 'WidgetB depends on WidgetC');

      // WidgetC has no dependencies
      const cDeps = deps.get(4) || [];
      assertEqual(cDeps.length, 0, 'WidgetC has 0 dependencies');
    }],

    ['expands transitive dependencies correctly', () => {
      const text = `
class MainWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return WidgetA();
  }
}

class WidgetA extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return WidgetB();
  }
}

class WidgetB extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return WidgetC();
  }
}

class WidgetC extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Text('Hello');
  }
}
`;
      const parsed = parseFile(text);
      // Indices:
      // 0: MainWidget
      // 1: WidgetA
      // 2: WidgetB
      // 3: WidgetC

      const deps = detectDependencies(parsed.widgets, parsed.stateMap);

      // If we select WidgetC (index 3)
      // Since WidgetB depends on WidgetC, WidgetB must be separated.
      // Since WidgetA depends on WidgetB, WidgetA must be separated.
      // So selected = {3} should expand to {1, 2, 3}
      const selected = new Set<number>([3]);
      const expanded = expandTransitiveDependencies(selected, parsed.widgets, deps);

      assertEqual(expanded.size, 3, 'expanded to 3 widgets');
      assertTrue(expanded.has(1), 'WidgetA is included');
      assertTrue(expanded.has(2), 'WidgetB is included');
      assertTrue(expanded.has(3), 'WidgetC is included');
      assertTrue(!expanded.has(0), 'MainWidget (index 0) is not included');
    }],
  ]);
}
