import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from "@shared/schema";

// Use HTTP connection for serverless compatibility (Netlify Functions)
// HTTP client avoids WebSocket connection issues in serverless environments

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });
