import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from "@shared/schema";

// Configure for Vercel serverless environment
if (typeof WebSocket === 'undefined') {
  // In Node.js environment (local development)
  const ws = await import("ws");
  neonConfig.webSocketConstructor = ws.default;
} else {
  // In Vercel serverless environment, use native WebSocket
  neonConfig.webSocketConstructor = WebSocket;
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });
