// Configuration for environment variables
export const config = {
  // Conversion rate from FOGO to Bonus tokens (default: 1 FOGO → 6627.974874249 BONUS)
  fogoToBonusRate: parseFloat(process.env.FOGO_TO_BONUS_RATE || "6627.974874249"),
  
  // Daily pool limit in FOGO (default: 300)
  dailyPoolLimit: parseFloat(process.env.DAILY_POOL_LIMIT || "300"),
  
  // Bonus token mint address
  bonusTokenMint: process.env.BONUS_TOKEN_MINT || "B7mVgAvW7i2wkcDS6WNCmNYi8FTUWBTScJk3vZ55JN4K",
  
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
    
    if (isNaN(this.fogoToBonusRate) || this.fogoToBonusRate <= 0) {
      throw new Error("FOGO_TO_BONUS_RATE must be a positive number");
    }
    
    if (isNaN(this.dailyPoolLimit) || this.dailyPoolLimit <= 0) {
      throw new Error("DAILY_POOL_LIMIT must be a positive number");
    }
    
    console.log("✅ Configuration validated successfully");
    console.log(`   FOGO to Bonus Rate: ${this.fogoToBonusRate}`);
    console.log(`   Daily Pool Limit: ${this.dailyPoolLimit} FOGO`);
    console.log(`   Bonus Token Mint: ${this.bonusTokenMint}`);
  }
};

// Export individual values for convenience
export const {
  fogoToBonusRate,
  dailyPoolLimit,
  bonusTokenMint,
  databaseUrl,
  fogoRpcUrl,
  solanaRpcUrl,
  privateKey,
  port,
  nodeEnv
} = config;