import { loadConfig } from './config';
import { createPool, migrate } from './db';

const config = loadConfig();
const db = createPool(config.DATABASE_URL, config.DATABASE_SSL);
console.log('applied:', await migrate(db));
await db.end();
