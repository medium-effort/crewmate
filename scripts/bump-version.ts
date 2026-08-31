#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const rawArg = process.argv[2];

if (!rawArg) {
  console.error('Error: Please specify a version to bump to.\n');
  console.error('Usage:');
  console.error('  npm run bump-version <version>');
  console.error('  npm run bump-version 0.3.0');
  process.exit(1);
}

// Clean leading 'v' if provided (e.g. "v0.3.0" -> "0.3.0")
const version = rawArg.startsWith('v') ? rawArg.slice(1) : rawArg;

// Validate SemVer format (e.g. 1.2.3, 1.2.3-alpha.1)
const semverRegex = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
if (!semverRegex.test(version)) {
  console.error(`Error: Invalid SemVer format "${rawArg}". Expected format: X.Y.Z (e.g., 0.3.0)`);
  process.exit(1);
}

const rootDir = process.cwd();
const updatedFiles: string[] = [];

// 1. Update package.json
const pkgPath = resolve(rootDir, 'package.json');
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  updatedFiles.push('package.json');
}

// 2. Update package-lock.json
const pkgLockPath = resolve(rootDir, 'package-lock.json');
if (existsSync(pkgLockPath)) {
  const lock = JSON.parse(readFileSync(pkgLockPath, 'utf-8'));
  lock.version = version;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = version;
  }
  writeFileSync(pkgLockPath, JSON.stringify(lock, null, 2) + '\n', 'utf-8');
  updatedFiles.push('package-lock.json');
}

// 3. Update src/harness/manifest.ts
const manifestPath = resolve(rootDir, 'src/harness/manifest.ts');
if (existsSync(manifestPath)) {
  let manifestContent = readFileSync(manifestPath, 'utf-8');
  manifestContent = manifestContent.replace(
    /export const CREWMATE_VERSION = ['"][^'"]+['"];/,
    `export const CREWMATE_VERSION = '${version}';`
  );
  writeFileSync(manifestPath, manifestContent, 'utf-8');
  updatedFiles.push('src/harness/manifest.ts');
}

console.log(`\nSuccessfully bumped Crewmate version to v${version}!\n`);
console.log('Updated files:');
for (const file of updatedFiles) {
  console.log(`  - ${file}`);
}
console.log('');
