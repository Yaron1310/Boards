#!/usr/bin/env node
/**
 * Finds translation keys used in source code that are missing from the English
 * translation file, then adds them with human-readable placeholder values.
 *
 * Usage: node scripts/find-missing-translations.js [--dry-run]
 *   --dry-run  Report missing keys without modifying the translation file
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '../src');
const TRANSLATION_FILE = path.resolve(__dirname, '../public/locales/en/translation.json');
const DRY_RUN = process.argv.includes('--dry-run');

// Recursively collect all .ts / .tsx files under a directory
function collectSourceFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

// Extract all static translation keys from t('key') / t("key") / t(`key`) calls.
// Skips template literals that contain interpolation (${...}).
function extractKeysFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const keys = new Set();

  // Match: t(  'key'  or  "key"  or  `key`  )
  // The key must not contain template-literal interpolation markers.
  const RE = /\bt\(\s*(['"`])([^'"`\n${}\\]+)\1/g;
  let match;
  while ((match = RE.exec(content)) !== null) {
    keys.add(match[2]);
  }
  return keys;
}

// Get a value from a nested object using dot-notation key
function getNestedValue(obj, key) {
  return key.split('.').reduce((cur, part) => {
    if (cur === undefined || cur === null || typeof cur !== 'object') return undefined;
    return cur[part];
  }, obj);
}

// Set a value in a nested object using dot-notation key, creating intermediary
// objects as needed. Preserves existing sibling keys.
function setNestedValue(obj, key, value) {
  const parts = key.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof cur[part] !== 'object' || cur[part] === null) {
      cur[part] = {};
    }
    cur = cur[part];
  }
  cur[parts[parts.length - 1]] = value;
}

// Convert camelCase / PascalCase identifier to Title Case words
// e.g. "planSaved" → "Plan Saved", "confirmRemoveAdmin" → "Confirm Remove Admin"
function camelToTitleCase(str) {
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

// Build a human-readable placeholder from a dot-notation key.
// Uses the last segment, title-cased.
function buildPlaceholder(key) {
  const lastSegment = key.split('.').pop();
  return camelToTitleCase(lastSegment);
}

// Sort object keys so that string values come before nested objects,
// then alphabetically within each group — keeps the file tidy.
function sortTranslationObject(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const strings = {};
  const nested = {};
  for (const k of Object.keys(obj).sort()) {
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      nested[k] = sortTranslationObject(obj[k]);
    } else {
      strings[k] = obj[k];
    }
  }
  return { ...strings, ...nested };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const translation = JSON.parse(fs.readFileSync(TRANSLATION_FILE, 'utf8'));

// Collect all keys referenced in source code
const allCodeKeys = new Set();
for (const file of collectSourceFiles(SRC_DIR)) {
  for (const key of extractKeysFromFile(file)) {
    allCodeKeys.add(key);
  }
}

// Find keys missing from the English translation file
const missingKeys = [...allCodeKeys]
  .filter((key) => getNestedValue(translation, key) === undefined)
  .sort();

console.log(`\nFound ${allCodeKeys.size} unique translation keys in source code.`);
console.log(`Existing English translation keys: checked against translation.json`);
console.log(`\nMissing keys (${missingKeys.length}):`);

if (missingKeys.length === 0) {
  console.log('  None! All translation keys are present.');
} else {
  for (const key of missingKeys) {
    const placeholder = buildPlaceholder(key);
    console.log(`  ${key}  →  "${placeholder}"`);
  }
}

if (!DRY_RUN && missingKeys.length > 0) {
  // Add missing keys with placeholder values
  for (const key of missingKeys) {
    setNestedValue(translation, key, buildPlaceholder(key));
  }

  // Write back with sorted keys and 2-space indentation
  fs.writeFileSync(
    TRANSLATION_FILE,
    JSON.stringify(sortTranslationObject(translation), null, 2) + '\n',
    'utf8'
  );

  console.log(`\n✓ Added ${missingKeys.length} missing key(s) to:`);
  console.log(`  ${TRANSLATION_FILE}`);
  console.log('\nPlease review and replace the placeholder values with proper English text.');
} else if (DRY_RUN) {
  console.log('\n(Dry-run mode — no files were modified.)');
}
