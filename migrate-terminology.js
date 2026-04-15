#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /dist/,
  /build/,
  /\.lock$/,
  /\.md$/,
];

const MIGRATIONS = [
  // Specific role and ID mappings (must run first to avoid conflicts)
  { name: 'workspace_admin → workspace_admin', pattern: /\borganization_admin\b/g, replacement: 'workspace_admin' },
  { name: 'org_admin → org_admin', pattern: /\bacademy_admin\b/g, replacement: 'org_admin' },
  { name: 'orgId → orgId', pattern: /\bacademyId\b/g, replacement: 'orgId' },
  // Plurals (must run before singulars)
  { name: 'Workspaces → Workspaces', pattern: /\bOrganizations\b/g, replacement: 'Workspaces' },
  { name: 'workspaces → workspaces', pattern: /\borganizations\b/g, replacement: 'workspaces' },
  { name: 'Organizations → Workspaces',  pattern: /\bAcademies\b/g,     replacement: 'Workspaces' },
  { name: 'organizations → workspaces',  pattern: /\bacademies\b/g,      replacement: 'workspaces' },
  // Singulars
  { name: 'Workspace → Workspace',   pattern: /\bOrganization\b/g,   replacement: 'Workspace' },
  { name: 'workspace → workspace',   pattern: /\borganization\b/g,   replacement: 'workspace' },
  { name: 'Organization → Workspace',     pattern: /\bAcademy\b/g,        replacement: 'Workspace' },
  { name: 'organization → workspace',     pattern: /\bacademy\b/g,        replacement: 'workspace' },
];

const DRY_RUN = process.argv.includes('--apply') === false;

// Helper: Check if file should be processed
function shouldProcessFile(filePath) {
  return !EXCLUDE_PATTERNS.some(pattern => pattern.test(filePath));
}

// Helper: Recursively get all files
function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const relativePath = path.relative(process.cwd(), filePath);

    if (!shouldProcessFile(relativePath)) {
      return;
    }

    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });

  return fileList;
}

// Main migration logic
function migrate() {
  const files = getAllFiles('.');
  let totalFiles = 0;
  let totalReplacements = 0;
  const changes = [];

  console.log(`\n🔍 Scanning ${files.length} files...\n`);

  files.forEach(filePath => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      let newContent = content;
      let fileReplacements = 0;

      MIGRATIONS.forEach(migration => {
        const matches = (newContent.match(migration.pattern) || []).length;
        if (matches > 0) {
          newContent = newContent.replace(migration.pattern, migration.replacement);
          fileReplacements += matches;
        }
      });

      if (fileReplacements > 0) {
        totalFiles++;
        totalReplacements += fileReplacements;
        changes.push({
          file: path.relative('.', filePath),
          count: fileReplacements,
        });
      }
    } catch (err) {
      // Skip files that can't be read (binaries, etc.)
    }
  });

  // Display summary
  console.log(`📊 MIGRATION SUMMARY (DRY RUN)\n`);
  console.log(`Files to be modified: ${totalFiles}`);
  console.log(`Total replacements: ${totalReplacements}\n`);

  if (changes.length > 0) {
    console.log(`📝 Files affected:\n`);
    changes.forEach(change => {
      console.log(`  ${change.file}`);
      console.log(`    → ${change.count} replacement${change.count !== 1 ? 's' : ''}`);
    });
  }

  console.log('\n' + '='.repeat(60));

  if (DRY_RUN) {
    console.log('\n✅ DRY RUN COMPLETE');
    console.log('\nTo apply these changes, run:');
    console.log('  node migrate-terminology.js --apply\n');
  } else {
    // Actually apply the migrations
    console.log('\n⚙️  APPLYING MIGRATIONS...\n');

    files.forEach(filePath => {
      try {
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;

        MIGRATIONS.forEach(migration => {
          const newContent = content.replace(migration.pattern, migration.replacement);
          if (newContent !== content) {
            content = newContent;
            modified = true;
          }
        });

        if (modified) {
          fs.writeFileSync(filePath, content, 'utf8');
        }
      } catch (err) {
        // Skip files that can't be written
      }
    });

    console.log('✅ MIGRATIONS APPLIED SUCCESSFULLY\n');
  }
}

migrate();
