import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
const unitTests = readdirSync('tests')
  .filter((name) => name.endsWith('.test.mjs'))
  .map((name) => `tests/${name}`);
for (const args of [
  ['node_modules/eslint/bin/eslint.js', '.'],
  ['node_modules/prettier/bin/prettier.cjs', '--check', '.'],
  ['--test', ...unitTests],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
