import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });

// Add connection health check for debugging
export async function testDatabaseConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log("✅ Database connection successful");
    return { success: true };
  } catch (error: any) {
    console.error("❌ Database connection failed:", error.message);
    return { success: false, error: error.message };
  }
}
