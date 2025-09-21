import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';
import * as schema from '../shared/schema';

// Configure WebSocket constructor for Neon serverless driver
neonConfig.webSocketConstructor = ws;

// Lazy-initialized singleton instances
let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb(): ReturnType<typeof drizzle> {
  // TEMP: Hardcoded for Vercel testnet deployment – move back to env vars for production
  const databaseUrl = 'postgresql://postgres.rdwfuxuiqnhgnomnrthy:vuQYe1s4BxjEQtXT@aws-1-us-east-1.pooler.supabase.com:6543/postgres';
  
  if (!databaseUrl) {
    throw new Error(
      "Database URL must be configured. Please check your database credentials."
    );
  }

  if (!_db) {
    // Configure connection pool for serverless environments
    _pool = new Pool({ 
      connectionString: databaseUrl,
      // Optimize for serverless - shorter timeouts and smaller pool
      max: 1, // Single connection for serverless functions
      idleTimeoutMillis: 0, // Close connections immediately when idle
      connectionTimeoutMillis: 5000, // 5 second connection timeout
      statement_timeout: 10000, // 10 second query timeout
    });
    _db = drizzle({ client: _pool, schema });
  }
  
  return _db!;
}

// Health check function that tests database connections
export async function checkDatabaseHealth(): Promise<{ 
  drizzle: boolean; 
  supabase?: { connected: boolean; configured: boolean };
  hasErrors: boolean;
}> {
  let drizzleConnected = false;
  let supabaseResult: { connected: boolean; configured: boolean } | undefined;
  let hasErrors = false;

  // Test Drizzle connection
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    drizzleConnected = true;
  } catch (err) {
    console.error('Drizzle connection failed:', err);
    hasErrors = true;
  }

  // Test Supabase connection if available (lazy import to avoid breaking environments without it)
  try {
    const { checkSupabaseConnection } = await import('./supabase.js');
    const result = await checkSupabaseConnection();
    supabaseResult = {
      connected: result.connected,
      configured: result.configured
    };
    if (result.configured && !result.connected) {
      console.error('Supabase connection failed');
      hasErrors = true;
    }
  } catch (err) {
    // Supabase not available or import failed - this is okay
    console.log('Supabase not available:', err instanceof Error ? err.message : 'Unknown error');
  }

  return {
    drizzle: drizzleConnected,
    supabase: supabaseResult,
    hasErrors
  };
}

// For compatibility with existing code that expects a default export
export default getDb;