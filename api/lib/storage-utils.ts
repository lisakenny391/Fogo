import { eq, desc, and, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from './database';
import { 
  type User, type InsertUser, type Claim, type InsertClaim, 
  type FaucetConfig, type InsertFaucetConfig, type RateLimit, type InsertRateLimit,
  type WalletEligibility, type InsertWalletEligibility, type BonusClaim, type InsertBonusClaim,
  type BonusDistributionStats, type InsertBonusDistributionStats,
  users, claims, faucetConfig, rateLimits, walletEligibility, bonusClaims, bonusDistributionStats
} from '../../shared/schema';

// Environment variable helpers
const getDailyPoolLimit = (): number => {
  const value = process.env.DAILY_POOL_LIMIT;
  if (!value) {
    throw new Error('DAILY_POOL_LIMIT environment variable is required');
  }
  const limit = parseFloat(value);
  if (isNaN(limit) || limit <= 0) {
    throw new Error('DAILY_POOL_LIMIT must be a positive number');
  }
  return limit;
};

const getFogoToBonusRate = (): number => {
  const value = process.env.FOGO_TO_BONUS;
  if (!value) {
    throw new Error('FOGO_TO_BONUS environment variable is required');
  }
  const rate = parseFloat(value);
  if (isNaN(rate) || rate <= 0) {
    throw new Error('FOGO_TO_BONUS must be a positive number');
  }
  return rate;
};

const getBonusTokenMint = (): string => {
  const value = process.env.BONUS_TOKEN_MINT;
  if (!value) {
    throw new Error('BONUS_TOKEN_MINT environment variable is required');
  }
  return value;
};

// Database utility functions for serverless use

// Initialize default faucet config if it doesn't exist
export const ensureFaucetConfig = async (): Promise<void> => {
  const [existing] = await db.select().from(faucetConfig).limit(1);
  if (!existing) {
    const now = new Date();
    await db.insert(faucetConfig).values({
      balance: '1000000',
      dailyLimit: getDailyPoolLimit().toString(),
      dailyDistributed: '0',
      dailyResetDate: now,
      isActive: true,
      lastRefill: now,
      updatedAt: now
    });
  }
};

// Faucet configuration operations
export const getFaucetConfig = async (): Promise<FaucetConfig | undefined> => {
  await ensureFaucetConfig();
  const [config] = await db.select().from(faucetConfig).limit(1);
  return config || undefined;
};

export const updateFaucetConfig = async (config: Partial<InsertFaucetConfig>): Promise<FaucetConfig | undefined> => {
  const existing = await getFaucetConfig();
  if (!existing) {
    return undefined;
  }
  
  const [updatedConfig] = await db.update(faucetConfig)
    .set({
      ...config,
      updatedAt: new Date()
    })
    .where(eq(faucetConfig.id, existing.id))
    .returning();
  return updatedConfig || undefined;
};

// Claim operations
export const createClaim = async (insertClaim: InsertClaim): Promise<Claim> => {
  const [claim] = await db.insert(claims).values({
    ...insertClaim,
    status: insertClaim.status || 'pending'
  }).returning();
  return claim;
};

export const getClaimsByWallet = async (walletAddress: string): Promise<Claim[]> => {
  return await db.select().from(claims)
    .where(sql`LOWER(${claims.walletAddress}) = LOWER(${walletAddress})`);
};

export const getRecentClaims = async (limit = 10): Promise<Claim[]> => {
  return await db.select().from(claims)
    .orderBy(desc(claims.createdAt))
    .limit(limit);
};

export const updateClaimStatus = async (id: string, status: string, transactionHash?: string): Promise<Claim | undefined> => {
  const updateData: any = {
    status: status as 'pending' | 'success' | 'failed',
    updatedAt: new Date()
  };
  if (transactionHash) {
    updateData.transactionHash = transactionHash;
  }
  
  const [updatedClaim] = await db.update(claims)
    .set(updateData)
    .where(eq(claims.id, id))
    .returning();
  return updatedClaim || undefined;
};

// Rate limiting operations
export const getRateLimit = async (walletAddress: string): Promise<RateLimit | undefined> => {
  const [rateLimit] = await db.select().from(rateLimits)
    .where(sql`LOWER(${rateLimits.walletAddress}) = LOWER(${walletAddress})`);
  return rateLimit || undefined;
};

export const createOrUpdateRateLimit = async (insertRateLimit: InsertRateLimit): Promise<RateLimit> => {
  const walletAddress = insertRateLimit.walletAddress.toLowerCase();
  
  try {
    const [updatedRateLimit] = await db.update(rateLimits)
      .set({
        lastClaim: new Date(),
        claimCount: insertRateLimit.claimCount || sql`${rateLimits.claimCount}`,
        resetDate: insertRateLimit.resetDate
      })
      .where(sql`LOWER(${rateLimits.walletAddress}) = ${walletAddress}`)
      .returning();
      
    if (updatedRateLimit) {
      return updatedRateLimit;
    }
    
    const [rateLimit] = await db.insert(rateLimits).values({
      ...insertRateLimit,
      walletAddress: walletAddress,
      lastClaim: new Date(),
      claimCount: insertRateLimit.claimCount || 1
    }).returning();
    return rateLimit;
  } catch (error) {
    const existingRateLimit = await getRateLimit(walletAddress);
    if (existingRateLimit) {
      const [updatedRateLimit] = await db.update(rateLimits)
        .set({
          lastClaim: new Date(),
          claimCount: insertRateLimit.claimCount || existingRateLimit.claimCount,
          resetDate: insertRateLimit.resetDate
        })
        .where(eq(rateLimits.id, existingRateLimit.id))
        .returning();
      return updatedRateLimit;
    }
    throw error;
  }
};

// Daily pool management
export const getRemainingDailyPool = async (): Promise<{ remaining: string; total: string; isExhausted: boolean }> => {
  const envDailyLimit = getDailyPoolLimit();
  const envDailyLimitStr = envDailyLimit.toString();
  
  const now = new Date();
  const [result] = await db.select({
    remaining: sql<string>`GREATEST(
      CAST(${envDailyLimitStr} AS DECIMAL) - CASE 
        WHEN date_trunc('day', ${faucetConfig.dailyResetDate} AT TIME ZONE 'UTC') < date_trunc('day', ${now} AT TIME ZONE 'UTC')
        THEN 0 
        ELSE ${faucetConfig.dailyDistributed}
      END, 0
    )`,
    distributed: sql<string>`CASE 
      WHEN date_trunc('day', ${faucetConfig.dailyResetDate} AT TIME ZONE 'UTC') < date_trunc('day', ${now} AT TIME ZONE 'UTC')
      THEN 0 
      ELSE ${faucetConfig.dailyDistributed}
    END`
  }).from(faucetConfig).limit(1);
  
  if (!result) {
    return { remaining: envDailyLimitStr, total: envDailyLimitStr, isExhausted: false };
  }
  
  const remainingAmount = parseFloat(result.remaining);
  
  return {
    remaining: remainingAmount.toFixed(8),
    total: envDailyLimitStr,
    isExhausted: remainingAmount <= 0
  };
};

export const getEligibleClaimAmount = async (transactionCount: number, walletBalance: string): Promise<{ amount: string; eligible: boolean; reason?: string }> => {
  const balance = parseFloat(walletBalance);
  if (balance > 10) {
    return {
      amount: '0',
      eligible: false,
      reason: 'Not eligible'
    };
  }
  
  let claimAmount: string;
  
  if (transactionCount < 50) {
    return {
      amount: '0',
      eligible: false,
      reason: 'Not eligible'
    };
  } else if (transactionCount >= 50 && transactionCount < 160) {
    claimAmount = '0.2';
  } else if (transactionCount >= 160 && transactionCount < 400) {
    claimAmount = '0.5';
  } else if (transactionCount >= 400 && transactionCount < 1000) {
    claimAmount = '1.0';
  } else if (transactionCount >= 1000 && transactionCount < 1500) {
    claimAmount = '1.5';
  } else if (transactionCount >= 1500 && transactionCount < 3000) {
    claimAmount = '2.0';
  } else {
    claimAmount = '3.0';
  }
  
  const envDailyLimit = getDailyPoolLimit();
  const envDailyLimitStr = envDailyLimit.toString();
  
  const [result] = await db.select({
    remaining: sql<string>`GREATEST(CAST(${envDailyLimitStr} AS DECIMAL) - ${faucetConfig.dailyDistributed}, 0)`,
    finalAmount: sql<string>`LEAST(CAST(${claimAmount} AS DECIMAL), GREATEST(CAST(${envDailyLimitStr} AS DECIMAL) - ${faucetConfig.dailyDistributed}, 0))`
  }).from(faucetConfig).limit(1);
  
  if (!result) {
    return {
      amount: '0',
      eligible: false,
      reason: 'Faucet configuration not found'
    };
  }
  
  const remainingPool = parseFloat(result.remaining);
  const finalAmount = parseFloat(result.finalAmount);
  
  if (remainingPool <= 0) {
    return {
      amount: '0',
      eligible: false,
      reason: 'Target has reached. Try again tomorrow.'
    };
  }
  
  return {
    amount: finalAmount.toFixed(8),
    eligible: true
  };
};

// Analytics operations
export const getTotalClaims = async (): Promise<number> => {
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(claims);
  return result.count;
};

export const getTotalUsers = async (): Promise<number> => {
  const [result] = await db.select({
    count: sql<number>`count(DISTINCT LOWER(${claims.walletAddress}))`
  }).from(claims);
  return result.count;
};

export const getTotalDistributed = async (): Promise<string> => {
  const [result] = await db.select({
    total: sql<string>`COALESCE(SUM(CAST(${claims.amount} AS DECIMAL)), 0)`
  }).from(claims).where(eq(claims.status, 'success'));
  return parseFloat(result.total || '0').toFixed(8);
};

export const getLeaderboard = async (limit = 10): Promise<Array<{ walletAddress: string; claims: number; totalAmount: string; lastClaim: Date; bonusClaims: number; totalBonusAmount: string }>> => {
  const results = await db.select({
    walletAddress: sql<string>`MIN(${claims.walletAddress})`,
    claimCount: sql<number>`count(*)`,
    totalAmount: sql<string>`COALESCE(SUM(CAST(${claims.amount} AS DECIMAL)), 0)`,
    lastClaim: sql<string>`MAX(${claims.createdAt})`
  })
  .from(claims)
  .where(eq(claims.status, 'success'))
  .groupBy(sql`LOWER(${claims.walletAddress})`)
  .orderBy(desc(sql`count(*)`))
  .limit(limit);
  
  const walletAddresses = results.map(result => result.walletAddress);
  let bonusData: Record<string, { bonusClaims: number; totalBonusAmount: string }> = {};
  
  if (walletAddresses.length > 0) {
    const bonusResults = await db.select({
      walletAddress: sql<string>`MIN(${bonusClaims.walletAddress})`,
      bonusClaimCount: sql<number>`count(*)`,
      totalBonusAmount: sql<string>`COALESCE(SUM(CAST(${bonusClaims.bonusAmount} AS DECIMAL)), 0)`
    })
    .from(bonusClaims)
    .where(and(
      eq(bonusClaims.status, 'success'),
      sql`LOWER(${bonusClaims.walletAddress}) IN (${sql.join(walletAddresses.map(addr => sql`LOWER(${addr})`), sql`, `)})`
    ))
    .groupBy(sql`LOWER(${bonusClaims.walletAddress})`);

    bonusData = bonusResults.reduce((acc, result) => {
      const lowerAddress = result.walletAddress.toLowerCase();
      acc[lowerAddress] = {
        bonusClaims: result.bonusClaimCount,
        totalBonusAmount: parseFloat(result.totalBonusAmount || '0').toFixed(2)
      };
      return acc;
    }, {} as Record<string, { bonusClaims: number; totalBonusAmount: string }>);
  }
  
  return results.map(result => ({
    walletAddress: result.walletAddress,
    claims: result.claimCount,
    totalAmount: parseFloat(result.totalAmount || '0').toFixed(8),
    lastClaim: new Date(result.lastClaim),
    bonusClaims: bonusData[result.walletAddress.toLowerCase()]?.bonusClaims || 0,
    totalBonusAmount: bonusData[result.walletAddress.toLowerCase()]?.totalBonusAmount || '0.00'
  }));
};

export const getClaimStats = async (): Promise<Array<{ date: string; claims: number; users: number }>> => {
  const results = await db.select({
    date: sql<string>`DATE(${claims.createdAt})`,
    claimCount: sql<number>`count(*)`,
    userCount: sql<number>`count(DISTINCT LOWER(${claims.walletAddress}))`
  })
  .from(claims)
  .groupBy(sql`DATE(${claims.createdAt})`)
  .orderBy(sql`DATE(${claims.createdAt})`);
  
  return results.slice(-7).map(result => ({
    date: result.date,
    claims: result.claimCount,
    users: result.userCount
  }));
};

// Bonus operations
export const calculateBonusAmount = async (fogoAmount: string): Promise<{ bonusAmount: string; conversionRate: string }> => {
  const rate = getFogoToBonusRate();
  const fogo = parseFloat(fogoAmount);
  const bonus = fogo * rate;
  
  return {
    bonusAmount: bonus.toFixed(2),
    conversionRate: rate.toString()
  };
};

export const getBonusDistributionStats = async (): Promise<BonusDistributionStats | undefined> => {
  const [stats] = await db.select().from(bonusDistributionStats).limit(1);
  return stats || undefined;
};

export const getTotalBonusDistributed = async (): Promise<string> => {
  const [result] = await db.select({
    total: sql<string>`COALESCE(SUM(CAST(${bonusClaims.bonusAmount} AS DECIMAL)), 0)`
  }).from(bonusClaims).where(eq(bonusClaims.status, 'success'));
  return parseFloat(result.total || '0').toFixed(2);
};

// Complex atomic operations for serverless use
export const processClaimAtomic = async (
  insertClaim: InsertClaim, 
  transactionCount: number, 
  walletBalance: string
): Promise<{ success: boolean; claim?: Claim; remaining?: string; error?: string }> => {
  if (parseFloat(walletBalance) > 10) {
    return { success: false, error: 'Not eligible' };
  }
  
  if (transactionCount < 50) {
    return { success: false, error: 'Not eligible' };
  }
  
  let baseClaimAmount: string;
  if (transactionCount >= 50 && transactionCount < 160) {
    baseClaimAmount = '0.2';
  } else if (transactionCount >= 160 && transactionCount < 400) {
    baseClaimAmount = '0.5';
  } else if (transactionCount >= 400 && transactionCount < 1000) {
    baseClaimAmount = '1.0';
  } else if (transactionCount >= 1000 && transactionCount < 1500) {
    baseClaimAmount = '1.5';
  } else if (transactionCount >= 1500 && transactionCount < 3000) {
    baseClaimAmount = '2.0';
  } else {
    baseClaimAmount = '3.0';
  }
  
  const envDailyLimit = getDailyPoolLimit();
  const envDailyLimitStr = envDailyLimit.toString();
  
  return await db.transaction(async (tx) => {
    const now = new Date();
    
    const result = await tx.execute(sql`
      WITH config_update AS (
        SELECT 
          id,
          balance,
          daily_limit,
          CASE 
            WHEN date_trunc('day', daily_reset_date AT TIME ZONE 'UTC') < date_trunc('day', ${now} AT TIME ZONE 'UTC')
            THEN 0
            ELSE daily_distributed
          END as current_distributed,
          LEAST(
            CAST(${baseClaimAmount} AS DECIMAL),
            GREATEST(
              CAST(${envDailyLimitStr} AS DECIMAL) - CASE 
                WHEN date_trunc('day', daily_reset_date AT TIME ZONE 'UTC') < date_trunc('day', ${now} AT TIME ZONE 'UTC')
                THEN 0
                ELSE daily_distributed
              END,
              0
            )
          ) as awarded_amount,
          CASE 
            WHEN date_trunc('day', daily_reset_date AT TIME ZONE 'UTC') < date_trunc('day', ${now} AT TIME ZONE 'UTC')
            THEN ${now}
            ELSE daily_reset_date
          END as new_reset_date
        FROM faucet_config
        FOR UPDATE
      ),
      faucet_update AS (
        UPDATE faucet_config
        SET 
          daily_distributed = config_update.current_distributed + config_update.awarded_amount,
          daily_reset_date = config_update.new_reset_date,
          updated_at = ${now}
        FROM config_update
        WHERE faucet_config.id = config_update.id
        RETURNING 
          config_update.awarded_amount,
          CAST(${envDailyLimitStr} AS DECIMAL) - (config_update.current_distributed + config_update.awarded_amount) as remaining_pool
      )
      SELECT awarded_amount, remaining_pool FROM faucet_update
    `);
    
    const configResult = result.rows[0] as any;
    
    if (!configResult || parseFloat(configResult.awarded_amount) <= 0) {
      throw new Error('Daily pool exhausted or no eligible amount');
    }
    
    const awardedAmount = parseFloat(configResult.awarded_amount);
    const remainingPool = parseFloat(configResult.remaining_pool);
    
    const [claim] = await tx.insert(claims).values({
      id: randomUUID(),
      walletAddress: insertClaim.walletAddress,
      amount: awardedAmount.toFixed(8),
      status: 'pending',
      createdAt: now,
      updatedAt: now
    }).returning();
    
    return {
      success: true,
      claim,
      remaining: remainingPool.toFixed(8)
    };
  });
};

export const finalizeClaim = async (claimId: string, outcome: { success: boolean; txHash?: string | null }): Promise<{ success: boolean; error?: string }> => {
  try {
    await updateClaimStatus(claimId, outcome.success ? 'success' : 'failed', outcome.txHash || undefined);
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to finalize claim' };
  }
};

export const processBonusClaimAtomic = async (bonusClaim: InsertBonusClaim): Promise<{ success: boolean; bonusClaim?: BonusClaim; error?: string }> => {
  try {
    const [claim] = await db.insert(bonusClaims).values({
      id: randomUUID(),
      ...bonusClaim,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    
    return { success: true, bonusClaim: claim };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to process bonus claim' };
  }
};

export const finalizeBonusClaim = async (bonusClaimId: string, outcome: { success: boolean; txHash?: string | null }): Promise<{ success: boolean; error?: string }> => {
  try {
    const updateData: any = {
      status: outcome.success ? 'success' : 'failed' as const,
      updatedAt: new Date()
    };
    if (outcome.txHash) {
      updateData.transactionHash = outcome.txHash;
    }
    
    await db.update(bonusClaims)
      .set(updateData)
      .where(eq(bonusClaims.id, bonusClaimId));
    
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to finalize bonus claim' };
  }
};