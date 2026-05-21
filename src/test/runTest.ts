import { printSummary } from './utils';
import { runParserTests } from './parser.test';
import { runTransformerTests } from './transformer.test';
import { runConverterTests } from './converter.test';

async function main(): Promise<void> {
  console.log('Flutter Component Separator - Test Suite\n');

  await runParserTests();
  await runTransformerTests();
  await runConverterTests();

  printSummary();
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
