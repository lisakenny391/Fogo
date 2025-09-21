import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../shared/schema';

// ===== HARDCODED TESTNET CONFIG (permanent for testnet environment) =====
export const DATABASE_URL = 'postgresql://postgres.rdwfuxuiqnhgnomnrthy:vuQYe1s4BxjEQtXT@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

// ===== DATABASE POOL =====
export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 2, // Serverless-optimized: small pool to prevent connection exhaustion
  idleTimeoutMillis: 0, // Close connections immediately when idle
  connectionTimeoutMillis: 5000, // 5 second connection timeout
  statement_timeout: 10000, // 10 second query timeout
});

// Lazy-initialized singleton instances
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb(): ReturnType<typeof drizzle> {
  if (!_db) {
    _db = drizzle({ client: pool, schema });
  }
  return _db;
}

// Optional helper to run queries directly
export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
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

  // Test Drizzle connection with hardcoded credentials
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    drizzleConnected = true;
    console.log('✅ Hardcoded database connection successful');
  } catch (err) {
    console.error('❌ Hardcoded database connection failed:', err);
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