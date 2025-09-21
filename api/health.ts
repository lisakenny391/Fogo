import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../lib/db.js';
import { sql } from 'drizzle-orm';

async function testDatabaseConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    console.log("✅ Database connection successful");
    return { success: true };
  } catch (error: any) {
    console.error("❌ Database connection failed:", error.message);
    return { success: false, error: error.message };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const dbTest = await testDatabaseConnection();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbTest.success ? 'connected' : 'disconnected',
      error: dbTest.error || null,
      environment: process.env.VERCEL ? 'vercel' : 'development'
    });
  } catch (error: any) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'error',
      error: error.message,
      environment: process.env.VERCEL ? 'vercel' : 'development'
    });
  }
}