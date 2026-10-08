import { loadConfig } from './config';
import { createPool, migrate } from './db';
import { seedDemo } from './demo';

const config = loadConfig();
const db = createPool(config.DATABASE_URL, config.DATABASE_SSL);
await migrate(db);
console.log((await seedDemo(db)) ? 'demo data inserted' : 'database not empty — skipped');
await db.end();
