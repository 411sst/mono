import fs from 'node:fs';
import path from 'node:path';
import { validateMap } from './validator.js';

export function loadMapCatalog(mapsDir = path.resolve('maps')) {
  const files = fs.readdirSync(mapsDir).filter((f) => f.endsWith('.json'));
  const catalog = new Map();
  for (const file of files) {
    const map = JSON.parse(fs.readFileSync(path.join(mapsDir, file), 'utf-8'));
    const result = validateMap(map);
    if (!result.ok) {
      throw new Error(`Invalid map ${file}: ${result.issues.join('; ')}`);
    }
    catalog.set(map.id, map);
  }
  return catalog;
}
