import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from '../../shared/schema';

// Configure WebSocket constructor for Neon
neonConfig.webSocketConstructor = ws;

// Environment variable validation
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set. Did you forget to provision a database?');
}

// Create pool with SSL configuration for Vercel deployment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Neon/Heroku style DBs
  max: 20, // maximum number of connections in the pool
  idleTimeoutMillis: 30000, // close connections after 30 seconds of inactivity
  connectionTimeoutMillis: 2000, // return an error after 2 seconds if connection could not be established
});

// Create drizzle database instance
export const db = drizzle({ client: pool, schema });

// Export pool for direct use if needed
export { pool };

// Graceful cleanup function for serverless environments
export const closePool = async () => {
  try {
    await pool.end();
  } catch (error) {
    console.error('Error closing database pool:', error);
  }
};