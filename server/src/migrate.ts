import { loadConfig } from './config';
import { createPool, migrate } from './db';

const db = createPool(loadConfig().DATABASE_URL);
console.log('applied:', await migrate(db));
await db.end();
