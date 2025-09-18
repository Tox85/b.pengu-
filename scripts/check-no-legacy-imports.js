#!/usr/bin/env node

/**
 * Script de vérification des imports legacy
 * Vérifie qu'aucun fichier n'importe depuis src/__legacy__/ ou tests/legacy/
 * (sauf les tests de garde eux-mêmes)
 */

const fs = require('fs');
const path = require('path');

const LEGACY_PATHS = [
  'src/__legacy__/',
  'tests/legacy/'
];

const GUARD_FILES = [
  'tests/meta/imports.guard.test.ts'
];

function findFiles(dir, extensions = ['.ts', '.js']) {
  const files = [];
  
  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }
  
  traverse(dir);
  return files;
}

function checkFileForLegacyImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const violations = [];
  
  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    
    // Ignorer les commentaires et les lignes vides
    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine === '') {
      return;
    }
    
    // Vérifier les imports
    if (trimmedLine.includes('import') || trimmedLine.includes('require')) {
      for (const legacyPath of LEGACY_PATHS) {
        if (trimmedLine.includes(legacyPath)) {
          violations.push({
            line: index + 1,
            content: trimmedLine,
            legacyPath
          });
        }
      }
    }
  });
  
  return violations;
}

function main() {
  console.log('🔍 Vérification des imports legacy...');
  
  const srcFiles = findFiles('src');
  const testFiles = findFiles('tests');
  const allFiles = [...srcFiles, ...testFiles];
  
  let totalViolations = 0;
  const violationsByFile = {};
  
  for (const file of allFiles) {
    // Ignorer les fichiers de garde
    const isGuardFile = GUARD_FILES.some(guardFile => 
      file.replace(/\\/g, '/').includes(guardFile)
    );
    
    if (isGuardFile) {
      continue;
    }
    
    const violations = checkFileForLegacyImports(file);
    
    if (violations.length > 0) {
      violationsByFile[file] = violations;
      totalViolations += violations.length;
    }
  }
  
  if (totalViolations === 0) {
    console.log('✅ Aucun import legacy détecté');
    process.exit(0);
  } else {
    console.log(`❌ ${totalViolations} import(s) legacy détecté(s):`);
    
    for (const [file, violations] of Object.entries(violationsByFile)) {
      console.log(`\n📁 ${file}:`);
      violations.forEach(violation => {
        console.log(`  Ligne ${violation.line}: ${violation.content}`);
        console.log(`  ⚠️  Import depuis: ${violation.legacyPath}`);
      });
    }
    
    console.log('\n💡 Les imports depuis src/__legacy__/ et tests/legacy/ sont interdits.');
    console.log('   Utilisez les modules dans src/ et tests/ à la place.');
    
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { checkFileForLegacyImports, findFiles };
