import { cp, mkdir, rm } from 'node:fs/promises';
// Publish only runtime files. Tests, backups, dependencies and interview materials stay private.
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const file of ['index.html', 'style.css', 'sample-metrics.csv', 'src', 'vendor'])
  await cp(file, `dist/${file}`, { recursive: true });
await cp('public/_headers', 'dist/_headers');
console.log('Static site prepared in dist/');
