import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from '../shared/schema.js';

// Configure WebSocket constructor for Neon serverless driver
neonConfig.webSocketConstructor = ws;

// Lazy-initialized singleton instances
let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb(): ReturnType<typeof drizzle> {
  // Support both Vercel's standard variables and custom DATABASE_URL
  const databaseUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error(
      "POSTGRES_URL or DATABASE_URL must be set. Please configure your database in Vercel's Storage tab."
    );
  }

  if (!_db) {
    _pool = new Pool({ connectionString: databaseUrl });
    _db = drizzle({ client: _pool, schema });
  }
  
  return _db!;
}

// For compatibility with existing code that expects a default export
export default getDb;