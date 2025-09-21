// ===== VERCEL-ONLY ENVIRONMENT CHECK =====
function ensureVercelEnvironment(): void {
  // Only allow running on Vercel, not Replit or other environments
  if (!process.env.VERCEL && !process.env.VERCEL_ENV) {
    throw new Error("This application is configured to run only on Vercel deployment environment");
  }
}

// Dynamic configuration functions that read from environment variables
// These values must be set in Vercel environment variables
export function getFogoToBonusRate(): number {
  ensureVercelEnvironment();
  
  const value = process.env.FOGO_TO_BONUS;
  if (!value) {
    throw new Error("FOGO_TO_BONUS environment variable is required for Vercel deployment");
  }
  const rate = parseFloat(value);
  if (isNaN(rate) || rate <= 0) {
    throw new Error("FOGO_TO_BONUS must be a positive number");
  }
  return rate;
}

export function getDailyPoolLimit(): number {
  ensureVercelEnvironment();
  
  const value = process.env.DAILY_POOL_LIMIT;
  if (!value) {
    throw new Error("DAILY_POOL_LIMIT environment variable is required for Vercel deployment");
  }
  const limit = parseFloat(value);
  if (isNaN(limit) || limit <= 0) {
    throw new Error("DAILY_POOL_LIMIT must be a positive number");
  }
  return limit;
}

export function getBonusTokenMint(): string {
  ensureVercelEnvironment();
  
  const value = process.env.BONUS_TOKEN_MINT;
  if (!value) {
    throw new Error("BONUS_TOKEN_MINT environment variable is required for Vercel deployment");
  }
  return value;
}

// Tiered FOGO caps based on transaction count
export const TIERED_CAPS = {
  LOW_ACTIVITY: { maxTx: 80, cap: 20 },    // New users: <80 tx, 20 FOGO cap
  MID_ACTIVITY: { maxTx: 400, cap: 40 },   // Regular users: 80-400 tx, 40 FOGO cap  
  HIGH_ACTIVITY: { maxTx: Infinity, cap: 60 } // Power users: >400 tx, 60 FOGO cap
};

// Faucet constants
export const FAUCET_AMOUNT = 3;
export const LEGACY_BALANCE_CAP = 10; // Legacy cap, now using tiered caps

// Function to get appropriate cap based on transaction count
export function getBalanceCapForTxCount(txCount: number): number {
  if (txCount < TIERED_CAPS.LOW_ACTIVITY.maxTx) {
    return TIERED_CAPS.LOW_ACTIVITY.cap;
  } else if (txCount < TIERED_CAPS.MID_ACTIVITY.maxTx) {
    return TIERED_CAPS.MID_ACTIVITY.cap;
  } else {
    return TIERED_CAPS.HIGH_ACTIVITY.cap;
  }
}

// Static configuration values that don't change
export const config = {
  // Database URL
  databaseUrl: process.env.DATABASE_URL,
  
  // Solana network configuration
  fogoRpcUrl: process.env.FOGO_RPC_URL,
  solanaRpcUrl: process.env.SOLANA_RPC_URL,
  privateKey: process.env.PRIVATE_KEY,
  
  // Server configuration
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Validation function to ensure required environment variables are set
  validate(): void {
    if (!this.privateKey) {
      throw new Error("PRIVATE_KEY environment variable is required");
    }
    
    if (!this.databaseUrl) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    
    // Validate dynamic config values
    try {
      const fogoToBonusRate = getFogoToBonusRate();
      const dailyPoolLimit = getDailyPoolLimit();
      const bonusTokenMint = getBonusTokenMint();
      
      console.log("✅ Configuration validated successfully");
      console.log(`   FOGO to Bonus Rate: ${fogoToBonusRate}`);
      console.log(`   Daily Pool Limit: ${dailyPoolLimit} FOGO`);
      console.log(`   Bonus Token Mint: ${bonusTokenMint}`);
    } catch (error) {
      console.error("❌ Dynamic configuration validation failed:", (error as Error).message);
      throw error;
    }
  }
};

// Export individual static values for convenience
export const {
  databaseUrl,
  fogoRpcUrl,
  solanaRpcUrl,
  privateKey,
  port,
  nodeEnv
} = config;

// Legacy exports removed - use the dynamic function versions above instead:
// - getFogoToBonusRate()
// - getDailyPoolLimit() 
// - getBonusTokenMint()