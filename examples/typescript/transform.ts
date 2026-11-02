import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Transformer } from '../../packages/typescript/src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const source =
  process.argv[2] ?? resolve(here, '..', 'fixtures', 'invoice-31.json');
const payload = JSON.parse(readFileSync(source, 'utf8')) as object;

const result = new Transformer().json2xml(payload, true);
if (result.isErr()) {
  console.error('error:', result.error);
  process.exit(1);
}

const outputDir = resolve(here, '..', 'output');
mkdirSync(outputDir, { recursive: true });
const output = resolve(outputDir, `${basename(source, '.json')}.generated.xml`);
writeFileSync(output, result.value);
console.log(`Wrote ${output}`);
