const { rmSync } = require('node:fs');

const allowedTargets = new Set([
  'dist',
  '.tmp/test',
  '.tmp/e2e',
]);

for (const target of process.argv.slice(2)) {
  if (!allowedTargets.has(target)) {
    throw new Error(`Refusing to clean unknown output path: ${target}`);
  }
  rmSync(target, { recursive: true, force: true });
}
