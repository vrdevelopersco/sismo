import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const db = new DatabaseSync(path.join('data', 'sismos.db'));
db.exec("DELETE FROM sismos WHERE primary_source = 'SIMULADO' OR id LIKE 'sim_%'");
const count = db.prepare('SELECT COUNT(*) as count FROM sismos').get();
console.log('✅ Base de datos purgada. Total sismos reales:', count.count);
