import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');

const htmlFiles = fs.readdirSync(projectRoot).filter((name) => name.endsWith('.html'));
const jsFrontendFiles = [
  path.join(projectRoot, 'assets/js/api.js'),
  path.join(projectRoot, 'assets/js/calculator.js'),
  path.join(projectRoot, 'assets/js/data.js'),
  path.join(projectRoot, 'assets/js/main.js')
];
const jsBackendFiles = fs
  .readdirSync(path.join(backendRoot, 'src'))
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(backendRoot, 'src', name));

const errors = [];
const warnings = [];

function isLocalReference(value) {
  return value && !/^(https?:|mailto:|tel:|#|javascript:)/i.test(value);
}

function resolveLocalRef(baseFile, ref) {
  const clean = ref.split('#')[0].split('?')[0];
  return path.resolve(path.dirname(baseFile), clean);
}

for (const htmlName of htmlFiles) {
  const fullPath = path.join(projectRoot, htmlName);
  const source = fs.readFileSync(fullPath, 'utf8');

  for (const match of source.matchAll(/(?:href|src)=\"([^\"]+)\"/g)) {
    const ref = match[1];
    if (!isLocalReference(ref)) continue;

    const resolved = resolveLocalRef(fullPath, ref);
    if (!fs.existsSync(resolved)) {
      errors.push(`Broken reference in ${htmlName}: ${ref}`);
    }
  }

  const demoForms = [...source.matchAll(/<form[^>]*data-demo-form[^>]*>([\s\S]*?)<\/form>/g)];
  for (const [index, formMatch] of demoForms.entries()) {
    const formHtml = formMatch[0];
    if (!/name=\"name\"/.test(formHtml)) {
      errors.push(`${htmlName}: demo form #${index + 1} has no name field`);
    }
    if (!/name=\"phone\"/.test(formHtml)) {
      errors.push(`${htmlName}: demo form #${index + 1} has no phone field`);
    }
    if (!/name=\"email\"/.test(formHtml)) {
      errors.push(`${htmlName}: demo form #${index + 1} has no email field`);
    }
  }
}

for (const file of [...jsFrontendFiles, ...jsBackendFiles]) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    errors.push(`JS syntax error in ${path.relative(projectRoot, file)}: ${String(error.stderr || error.message).trim()}`);
  }
}

const summary = {
  ok: errors.length === 0,
  htmlFiles: htmlFiles.length,
  checkedFrontendJs: jsFrontendFiles.length,
  checkedBackendJs: jsBackendFiles.length,
  errors,
  warnings
};

fs.writeFileSync(
  path.join(backendRoot, 'validation-report.json'),
  JSON.stringify(summary, null, 2),
  'utf8'
);

if (!summary.ok) {
  console.error(JSON.stringify(summary, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(summary, null, 2));
