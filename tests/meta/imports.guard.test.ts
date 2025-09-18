/**
 * Test de garde pour empêcher l'import de modules legacy/obsolètes
 * Ce test échoue si un module interdit est importé
 */

describe('Imports Guard - Prévention des modules legacy', () => {
  const FORBIDDEN_MODULES = [
    'bridge_old.ts',
    'exchanges_v2.ts', 
    'trading_legacy.ts',
    'liquidity_old.ts',
    'monitor_v1.ts',
    'wallets_legacy.ts',
    'modules/bridge_old.ts',
    'modules/exchanges_v2.ts',
    'modules/trading_legacy.ts',
    'modules/liquidity_old.ts',
    'modules/monitor_v1.ts',
    'modules/wallets_legacy.ts',
    'src/bridge_old.ts',
    'src/exchanges_v2.ts',
    'src/trading_legacy.ts',
    'src/liquidity_old.ts',
    'src/monitor_v1.ts',
    'src/wallets_legacy.ts',
  ];

  it('ne devrait pas importer de modules legacy', () => {
    // Vérifier que les modules interdits ne sont pas importés
    const fs = require('fs');
    const path = require('path');
    
    // Parcourir tous les fichiers TypeScript
    const scanDirectory = (dir: string): string[] => {
      const files: string[] = [];
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          files.push(...scanDirectory(fullPath));
        } else if (item.endsWith('.ts') && !item.endsWith('.d.ts')) {
          files.push(fullPath);
        }
      }
      
      return files;
    };
    
    const allFiles = scanDirectory(process.cwd());
    const violations: string[] = [];
    
    for (const file of allFiles) {
      if (file.includes('node_modules') || file.includes('tests/meta/imports.guard.test.ts')) {
        continue;
      }
      
      try {
        const content = fs.readFileSync(file, 'utf8');
        
        for (const forbiddenModule of FORBIDDEN_MODULES) {
          // Vérifier les imports directs
          const importRegex = new RegExp(`import.*from\\s+['"]\\.*${forbiddenModule.replace('.ts', '')}['"]`, 'g');
          if (importRegex.test(content)) {
            violations.push(`${file}: import direct de ${forbiddenModule}`);
          }
          
          // Vérifier les require
          const requireRegex = new RegExp(`require\\s*\\(\\s*['"]\\.*${forbiddenModule.replace('.ts', '')}['"]\\s*\\)`, 'g');
          if (requireRegex.test(content)) {
            violations.push(`${file}: require de ${forbiddenModule}`);
          }
        }
      } catch (error) {
        // Ignorer les erreurs de lecture de fichier
      }
    }
    
    if (violations.length > 0) {
      console.error('❌ Modules legacy détectés:');
      violations.forEach(violation => console.error(`  - ${violation}`));
      fail(`Modules legacy interdits détectés: ${violations.length} violations`);
    }
    
    expect(violations.length).toBe(0);
  });

  it('devrait maintenir la liste des modules interdits à jour', () => {
    // Vérifier que la liste des modules interdits est cohérente
    expect(FORBIDDEN_MODULES.length).toBeGreaterThan(0);
    
    // Vérifier que tous les modules interdits ont des extensions .ts
    for (const module of FORBIDDEN_MODULES) {
      expect(module).toMatch(/\.ts$/);
    }
  });
});
