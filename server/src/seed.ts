import { loadConfig } from './config';
import { createPool, migrate } from './db';
import { seedDemo } from './demo';

const db = createPool(loadConfig().DATABASE_URL);
await migrate(db);
console.log((await seedDemo(db)) ? 'demo data inserted' : 'database not empty — skipped');
await db.end();
