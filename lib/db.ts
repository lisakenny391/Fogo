import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../shared/schema';

// Lazy-initialized singleton instances
let _sql: ReturnType<typeof neon> | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb(): ReturnType<typeof drizzle> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?"
    );
  }

  if (!_db) {
    _sql = neon(process.env.DATABASE_URL);
    _db = drizzle({ client: _sql, schema });
  }
  
  return _db!;
}

// For compatibility with existing code that expects a default export
export default getDb;