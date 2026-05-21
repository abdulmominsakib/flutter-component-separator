let passed = 0;
let failed = 0;
const failures: string[] = [];

export function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL: ${message}`);
    console.error(`  FAIL: ${message}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

export function assertContains(haystack: string, needle: string, message: string): void {
  if (haystack.includes(needle)) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL: ${message}`);
    console.error(`  FAIL: ${message}`);
    console.error(`    string does not contain: ${JSON.stringify(needle)}`);
    console.error(`    string: ${haystack.substring(0, 200)}...`);
  }
}

export function assertNotContains(haystack: string, needle: string, message: string): void {
  if (!haystack.includes(needle)) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL: ${message}`);
    console.error(`  FAIL: ${message}`);
    console.error(`    string should not contain: ${JSON.stringify(needle)}`);
  }
}

export function assertMatch(value: string, regex: RegExp, message: string): void {
  if (regex.test(value)) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL: ${message}`);
    console.error(`  FAIL: ${message}`);
    console.error(`    regex: ${regex}`);
    console.error(`    value: ${value.substring(0, 200)}`);
  }
}

export function assertTrue(value: boolean, message: string): void {
  if (value === true) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL: ${message}`);
    console.error(`  FAIL: ${message}`);
    console.error(`    expected: true, got: ${value}`);
  }
}

export function assertNotNull<T>(value: T | null | undefined, message: string): void {
  if (value !== null && value !== undefined) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL: ${message}`);
    console.error(`  FAIL: ${message}`);
    console.error(`    expected: not null, got: ${value}`);
  }
}

export function assertGreaterThan(actual: number, expected: number, message: string): void {
  if (actual > expected) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL: ${message}`);
    console.error(`  FAIL: ${message}`);
    console.error(`    expected > ${expected}, got: ${actual}`);
  }
}

export async function runSuite(name: string, tests: Array<[string, () => void | Promise<void>]>): Promise<void> {
  console.log(`\n${name}`);
  for (const [testName, fn] of tests) {
    try {
      await fn();
    } catch (e: any) {
      failed++;
      failures.push(`ERROR in "${testName}": ${e.message}`);
      console.error(`  ERROR: ${testName} - ${e.message}`);
    }
  }
}

export function printSummary(): void {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failures.length > 0) {
    console.log(`\nFailures:`);
    failures.forEach(f => console.log(`  ${f}`));
    process.exit(1);
  } else {
    console.log(`\nAll tests passed!`);
    process.exit(0);
  }
}
