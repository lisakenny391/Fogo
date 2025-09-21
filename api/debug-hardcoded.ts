// ⚠️ TEMPORARY DEBUGGING ONLY ⚠️
// This file contains hardcoded credentials for testing Vercel deployment
// DO NOT USE IN PRODUCTION - DELETE AFTER TESTING
// This is only for confirming database and RPC connectivity on Vercel

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';

// ⚠️ HARDCODED VALUES FOR DEBUGGING ONLY ⚠️
const HARDCODED_DATABASE_URL = 'postgresql://postgres.rdwfuxuiqnhgnomnrthy:vuQYe1s4BxjEQtXT@aws-1-us-east-1.pooler.supabase.com:6543/postgres';
const HARDCODED_RPC_URL = 'https://testnet.fogo.io';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const results: any = {
    timestamp: new Date().toISOString(),
    environment: 'vercel-debug',
    tests: {}
  };

  // Test 1: Database Connection with hardcoded URL
  try {
    console.log('Testing hardcoded database connection...');
    
    const pool = new Pool({ 
      connectionString: HARDCODED_DATABASE_URL,
      max: 1,
      idleTimeoutMillis: 0,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    });
    
    const db = drizzle({ client: pool });
    const dbResult = await db.execute(sql`SELECT 1 as test, NOW() as timestamp`);
    
    results.tests.database = {
      success: true,
      message: "Database connection successful with hardcoded credentials",
      result: dbResult.rows[0],
      connectionUrl: HARDCODED_DATABASE_URL.replace(/:[^:@]*@/, ':***@') // Hide password in logs
    };
    
    await pool.end(); // Close connection
    
  } catch (error: any) {
    console.error('Hardcoded database test failed:', error);
    results.tests.database = {
      success: false,
      error: error.message,
      connectionUrl: HARDCODED_DATABASE_URL.replace(/:[^:@]*@/, ':***@')
    };
  }

  // Test 2: RPC Connection Test
  try {
    console.log('Testing hardcoded RPC connection...');
    
    const rpcResponse = await fetch(HARDCODED_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getHealth'
      })
    });
    
    const rpcData = await rpcResponse.json();
    
    results.tests.rpc = {
      success: true,
      message: "RPC connection successful with hardcoded URL",
      rpcUrl: HARDCODED_RPC_URL,
      response: rpcData,
      status: rpcResponse.status
    };
    
  } catch (error: any) {
    console.error('Hardcoded RPC test failed:', error);
    results.tests.rpc = {
      success: false,
      error: error.message,
      rpcUrl: HARDCODED_RPC_URL
    };
  }

  // Test 3: Environment Variables Check
  results.tests.environmentVariables = {
    DATABASE_URL_present: !!process.env.DATABASE_URL,
    POSTGRES_URL_present: !!process.env.POSTGRES_URL,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV
  };

  // Overall status
  const allTestsPassed = results.tests.database?.success && results.tests.rpc?.success;
  
  results.summary = {
    allTestsPassed,
    message: allTestsPassed 
      ? "✅ All hardcoded connections successful - environment variables likely the issue"
      : "❌ Some hardcoded connections failed - check logs for details"
  };

  console.log('Debug test results:', JSON.stringify(results, null, 2));

  return res.status(allTestsPassed ? 200 : 500).json(results);
}