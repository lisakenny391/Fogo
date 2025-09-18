// Dynamic configuration functions that read from environment variables each time
// This allows real-time changes without application restart

// Dynamic configuration getters
export function getFogoToBonusRate(): number {
  const value = process.env.FOGO_TO_BONUS_RATE;
  if (!value) {
    throw new Error("FOGO_TO_BONUS_RATE environment variable is required");
  }
  const rate = parseFloat(value);
  if (isNaN(rate) || rate <= 0) {
    throw new Error("FOGO_TO_BONUS_RATE must be a positive number");
  }
  return rate;
}

export function getDailyPoolLimit(): number {
  const value = process.env.DAILY_POOL_LIMIT;
  if (!value) {
    throw new Error("DAILY_POOL_LIMIT environment variable is required");
  }
  const limit = parseFloat(value);
  if (isNaN(limit) || limit <= 0) {
    throw new Error("DAILY_POOL_LIMIT must be a positive number");
  }
  return limit;
}

export function getBonusTokenMint(): string {
  const value = process.env.BONUS_TOKEN_MINT;
  if (!value) {
    throw new Error("BONUS_TOKEN_MINT environment variable is required");
  }
  return value;
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