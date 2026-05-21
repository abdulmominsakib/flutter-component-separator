import { parseFile, WidgetClass, StateClass } from '../parser';
import { convertStatefulToStateless, replaceWidgetPairInContent } from '../converter';
import { cleanBlankLines } from '../transformer';
import {
  assertEqual,
  assertTrue,
  assertNotNull,
  assertContains,
  assertNotContains,
  assertGreaterThan,
  runSuite,
} from './utils';

export async function runConverterTests(): Promise<void> {
  await runSuite('Converter Tests', [

    // ─── Basic conversion: no state fields, no setState ──────────────
    ['converts simple StatefulWidget with no state', () => {
      const text = `
import 'package:flutter/material.dart';

class HelloWidget extends StatefulWidget {
  const HelloWidget({super.key});
  @override
  State<HelloWidget> createState() => _HelloWidgetState();
}

class _HelloWidgetState extends State<HelloWidget> {
  @override
  Widget build(BuildContext context) {
    return Text('Hello World');
  }
}
`;
      const parsed = parseFile(text);
      const widget = parsed.widgets[0];
      const state = parsed.stateMap.get(0)!;
      const result = convertStatefulToStateless(widget, state);

      assertContains(result.newContent, 'class HelloWidget extends StatelessWidget', 'converts to StatelessWidget');
      assertNotContains(result.newContent, 'StatefulWidget', 'no StatefulWidget remains');
      assertNotContains(result.newContent, 'createState', 'createState removed');
      assertContains(result.newContent, 'Widget build(BuildContext context)', 'build method present');
      assertContains(result.newContent, "Text('Hello World')", 'build body preserved');
      assertEqual(result.warnings.length, 0, 'no warnings for simple case');
    }],

    // ─── State fields → constructor params ───────────────────────────
    ['converts state fields to constructor params', () => {
      const text = `
import 'package:flutter/material.dart';

class CounterWidget extends StatefulWidget {
  const CounterWidget({super.key});
  @override
  State<CounterWidget> createState() => _CounterWidgetState();
}

class _CounterWidgetState extends State<CounterWidget> {
  int _count = 0;
  String _label = 'default';

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Text('$_label: $_count'),
    ]);
  }
}
`;
      const parsed = parseFile(text);
      const widget = parsed.widgets[0];
      const state = parsed.stateMap.get(0)!;
      const result = convertStatefulToStateless(widget, state);

      assertContains(result.newContent, 'class CounterWidget extends StatelessWidget', 'converts to StatelessWidget');
      assertContains(result.newContent, 'required this._count', 'count as constructor param');
      assertContains(result.newContent, 'required this._label', 'label as constructor param');
      assertContains(result.newContent, 'final int _count;', 'count field declared');
      assertContains(result.newContent, 'final String _label;', 'label field declared');
      assertTrue(result.warnings.length > 0, 'has warnings about state fields');
    }],

    // ─── widget.xxx references ───────────────────────────────────────
    ['replaces widget.xxx references with parameter names', () => {
      const text = `
import 'package:flutter/material.dart';

class ProfileCard extends StatefulWidget {
  final String name;
  final int age;
  const ProfileCard({required this.name, required this.age, super.key});
  @override
  State<ProfileCard> createState() => _ProfileCardState();
}

class _ProfileCardState extends State<ProfileCard> {
  @override
  Widget build(BuildContext context) {
    return Card(
      child: Column(children: [
        Text(widget.name),
        Text('\${widget.age} years old'),
      ]),
    );
  }
}
`;
      const parsed = parseFile(text);
      const widget = parsed.widgets[0];
      const state = parsed.stateMap.get(0)!;
      const result = convertStatefulToStateless(widget, state);

      assertContains(result.newContent, 'extends StatelessWidget', 'converts to StatelessWidget');
      assertContains(result.newContent, 'Text(name)', 'widget.name → name');
      assertContains(result.newContent, 'Text(\'${age} years old\')', 'widget.age → age');
      assertNotContains(result.newContent, 'widget.name', 'no widget. prefix left');
      assertNotContains(result.newContent, 'widget.age', 'no widget. prefix left');
    }],

    // ─── setState detection ──────────────────────────────────────────
    ['flags setState calls with warning', () => {
      const text = `
import 'package:flutter/material.dart';

class ToggleWidget extends StatefulWidget {
  const ToggleWidget({super.key});
  @override
  State<ToggleWidget> createState() => _ToggleWidgetState();
}

class _ToggleWidgetState extends State<ToggleWidget> {
  bool _on = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        setState(() {
          _on = !_on;
        });
      },
      child: Text(_on ? 'ON' : 'OFF'),
    );
  }
}
`;
      const parsed = parseFile(text);
      const widget = parsed.widgets[0];
      const state = parsed.stateMap.get(0)!;
      const result = convertStatefulToStateless(widget, state);

      assertTrue(result.warnings.length > 0, 'has setState warnings');
      assertTrue(result.warnings.some(w => w.includes('setState')), 'warning mentions setState');
      assertContains(result.newContent, 'Text(_on ? \'ON\' : \'OFF\')', 'build body preserved');
    }],

    // ─── Lifecycle method warnings ───────────────────────────────────
    ['generates warnings for initState, dispose, didChangeDependencies, didUpdateWidget', () => {
      const text = `
import 'package:flutter/material.dart';

class LifecycleWidget extends StatefulWidget {
  const LifecycleWidget({super.key});
  @override
  State<LifecycleWidget> createState() => _LifecycleWidgetState();
}

class _LifecycleWidgetState extends State<LifecycleWidget> {
  @override
  void initState() {
    super.initState();
  }
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
  }
  @override
  void didUpdateWidget(covariant LifecycleWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
  }
  @override
  void dispose() {
    super.dispose();
  }
  @override
  Widget build(BuildContext context) {
    return Container();
  }
}
`;
      const parsed = parseFile(text);
      const widget = parsed.widgets[0];
      const state = parsed.stateMap.get(0)!;
      const result = convertStatefulToStateless(widget, state);

      assertTrue(result.warnings.some(w => w.includes('initState')), 'warns about initState');
      assertTrue(result.warnings.some(w => w.includes('dispose')), 'warns about dispose');
      assertTrue(result.warnings.some(w => w.includes('didChangeDependencies')), 'warns about didChangeDependencies');
      assertTrue(result.warnings.some(w => w.includes('didUpdateWidget')), 'warns about didUpdateWidget');
      assertContains(result.newContent, 'TODO', 'has TODO comments');
      assertContains(result.newContent, 'initState() was removed', 'mentions initState in comments');
      assertContains(result.newContent, 'dispose() was removed', 'mentions dispose in comments');
    }],

    // ─── Preserves complex build body ────────────────────────────────
    ['preserves complex build method with indentation', () => {
      const text = `
import 'package:flutter/material.dart';

class ComplexWidget extends StatefulWidget {
  const ComplexWidget({super.key});
  @override
  State<ComplexWidget> createState() => _ComplexWidgetState();
}

class _ComplexWidgetState extends State<ComplexWidget> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Complex'),
        actions: [
          IconButton(
            icon: Icon(Icons.settings),
            onPressed: () {},
          ),
        ],
      ),
      body: ListView(
        padding: EdgeInsets.all(16.0),
        children: [
          ListTile(
            leading: Icon(Icons.person),
            title: Text('Item 1'),
            subtitle: Text('Subtitle 1'),
          ),
        ],
      ),
    );
  }
}
`;
      const parsed = parseFile(text);
      const widget = parsed.widgets[0];
      const state = parsed.stateMap.get(0)!;
      const result = convertStatefulToStateless(widget, state);

      assertContains(result.newContent, 'Scaffold(', 'scaffold present');
      assertContains(result.newContent, 'AppBar(', 'appbar present');
      assertContains(result.newContent, 'ListView(', 'listview present');
      assertContains(result.newContent, 'ListTile(', 'listtile present');
      assertContains(result.newContent, 'IconButton(', 'iconbutton present');
      assertNotContains(result.newContent, 'StatefulWidget', 'no StatefulWidget');
      assertNotContains(result.newContent, 'createState', 'no createState');
    }],

    // ─── replaceWidgetPairInContent ──────────────────────────────────
    ['replaces widget+state pair in file content', () => {
      const text = `
import 'package:flutter/material.dart';

class FooWidget extends StatefulWidget {
  const FooWidget({super.key});
  @override
  State<FooWidget> createState() => _FooWidgetState();
}

class _FooWidgetState extends State<FooWidget> {
  @override
  Widget build(BuildContext context) {
    return Text('Foo');
  }
}
`;
      const parsed = parseFile(text);
      const widget = parsed.widgets[0];
      const state = parsed.stateMap.get(0)!;
      const conversion = convertStatefulToStateless(widget, state);

      const newFile = replaceWidgetPairInContent(text, widget, state, conversion.newContent);

      assertNotContains(newFile, 'StatefulWidget', 'StatefulWidget removed');
      assertNotContains(newFile, 'createState', 'createState removed');
      assertNotContains(newFile, 'class _FooWidgetState', 'State class removed');
      assertContains(newFile, 'class FooWidget extends StatelessWidget', 'new StatelessWidget present');
      assertContains(newFile, "import 'package:flutter/material.dart'", 'import preserved');
    }],

    // ─── Widget after widget+state pair is preserved ─────────────────
    ['preserves classes after converted pair', () => {
      const text = `
import 'package:flutter/material.dart';

class FirstWidget extends StatefulWidget {
  const FirstWidget({super.key});
  @override
  State<FirstWidget> createState() => _FirstWidgetState();
}

class _FirstWidgetState extends State<FirstWidget> {
  @override
  Widget build(BuildContext context) {
    return Text('First');
  }
}

class SecondWidget extends StatelessWidget {
  const SecondWidget({super.key});
  @override
  Widget build(BuildContext context) {
    return Text('Second');
  }
}
`;
      const parsed = parseFile(text);
      const widget = parsed.widgets[0];
      const state = parsed.stateMap.get(0)!;
      const conversion = convertStatefulToStateless(widget, state);

      const newFile = replaceWidgetPairInContent(text, widget, state, conversion.newContent);

      assertContains(newFile, 'class SecondWidget extends StatelessWidget', 'second widget preserved');
      assertContains(newFile, "Text('Second')", 'second widget body preserved');
      assertNotContains(newFile, 'class _FirstWidgetState', 'old state class removed');
    }],

    // ─── Conversion with only @override build (no state) ─────────────
    ['converts when only build exists in state', () => {
      const text = `
import 'package:flutter/material.dart';

class MinimalWidget extends StatefulWidget {
  const MinimalWidget({super.key});
  @override
  State<MinimalWidget> createState() => _MinimalWidgetState();
}

class _MinimalWidgetState extends State<MinimalWidget> {
  @override
  Widget build(BuildContext context) {
    return SizedBox.shrink();
  }
}
`;
      const parsed = parseFile(text);
      const widget = parsed.widgets[0];
      const state = parsed.stateMap.get(0)!;
      const result = convertStatefulToStateless(widget, state);

      assertEqual(result.warnings.length, 0, 'no warnings');
      assertContains(result.newContent, 'extends StatelessWidget', 'correctly converted');
      assertContains(result.newContent, 'SizedBox.shrink()', 'build body correct');
      assertContains(result.newContent, 'const MinimalWidget({super.key});', 'constructor preserved');
    }],

    // ─── conversion includes widget.xxx for inherited widget properties ──
    ['handles widget.xxx property access', () => {
      const text = `
import 'package:flutter/material.dart';

class ColorBox extends StatefulWidget {
  final Color color;
  final double width;
  final double height;
  const ColorBox({required this.color, required this.width, required this.height, super.key});
  @override
  State<ColorBox> createState() => _ColorBoxState();
}

class _ColorBoxState extends State<ColorBox> {
  @override
  Widget build(BuildContext context) {
    return Container(
      color: widget.color,
      width: widget.width,
      height: widget.height,
    );
  }
}
`;
      const parsed = parseFile(text);
      const widget = parsed.widgets[0];
      const state = parsed.stateMap.get(0)!;
      const result = convertStatefulToStateless(widget, state);

      assertContains(result.newContent, 'color: color,', 'widget.color → color');
      assertContains(result.newContent, 'width: width,', 'widget.width → width');
      assertContains(result.newContent, 'height: height,', 'widget.height → height');
      assertNotContains(result.newContent, 'widget.', 'no widget. prefix');
    }],

    // ─── Conversion preserves existing widget.xxx fields ─────────────
    ['preserves existing constructor params from StatefulWidget', () => {
      const text = `
import 'package:flutter/material.dart';

class UserCard extends StatefulWidget {
  final String username;
  final String email;
  const UserCard({required this.username, required this.email, super.key});
  @override
  State<UserCard> createState() => _UserCardState();
}

class _UserCardState extends State<UserCard> {
  String _status = 'online';

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Text(widget.username),
      Text(widget.email),
      Text(_status),
    ]);
  }
}
`;
      const parsed = parseFile(text);
      const widget = parsed.widgets[0];
      const state = parsed.stateMap.get(0)!;
      const result = convertStatefulToStateless(widget, state);

      assertContains(result.newContent, 'String _status;', 'state field converted to constructor field');
      assertContains(result.newContent, 'Text(username)', 'widget.username → username');
      assertContains(result.newContent, 'Text(email)', 'widget.email → email');
      assertContains(result.newContent, 'Text(_status)', '_status reference preserved');
      assertContains(result.newContent, 'required this._status', '_status as constructor param');
      assertNotContains(result.newContent, 'widget.username', 'no widget. prefix');
    }],

    // ─── No state pair found ─────────────────────────────────────────
    ['extracts no stateClass for StatelessWidget', () => {
      const text = `
import 'package:flutter/material.dart';

class OnlyStateless extends StatelessWidget {
  const OnlyStateless({super.key});
  @override
  Widget build(BuildContext context) {
    return Text('Only');
  }
}
`;
      const parsed = parseFile(text);
      assertTrue(!parsed.stateMap.has(0), 'no state for StatelessWidget');
    }],

    // ─── Widget with field-only state (no defaults) ──────────────────
    ['handles fields declared without default values', () => {
      const text = `
import 'package:flutter/material.dart';

class DelayedWidget extends StatefulWidget {
  const DelayedWidget({super.key});
  @override
  State<DelayedWidget> createState() => _DelayedWidgetState();
}

class _DelayedWidgetState extends State<DelayedWidget> {
  String? _errorMessage;

  @override
  Widget build(BuildContext context) {
    return _errorMessage != null
        ? Text(_errorMessage!)
        : SizedBox.shrink();
  }
}
`;
      const parsed = parseFile(text);
      const state = parsed.stateMap.get(0);
      assertNotNull(state, 'state found');
      const result = convertStatefulToStateless(parsed.widgets[0], state!);
      assertContains(result.newContent, 'class DelayedWidget extends StatelessWidget', 'converts correctly');
      assertContains(result.newContent, '_errorMessage', 'nullable field preserved in build body');
    }],
  ]);
}
