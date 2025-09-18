import { type User, type InsertUser, type Claim, type InsertClaim, type FaucetConfig, type InsertFaucetConfig, type RateLimit, type InsertRateLimit, type WalletEligibility, type InsertWalletEligibility, type BonusClaim, type InsertBonusClaim, type BonusDistributionStats, type InsertBonusDistributionStats } from "@shared/schema";
import { users, claims, faucetConfig, rateLimits, walletEligibility, bonusClaims, bonusDistributionStats } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getDailyPoolLimit, getFogoToBonusRate } from "./config";

// Storage interface for faucet operations
export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Claim operations
  createClaim(claim: InsertClaim): Promise<Claim>;
  getClaimsByWallet(walletAddress: string): Promise<Claim[]>;
  getRecentClaims(limit?: number): Promise<Claim[]>;
  updateClaimStatus(id: string, status: string, transactionHash?: string): Promise<Claim | undefined>;
  getPendingClaimsByWallet(walletAddress: string): Promise<Claim[]>;
  createClaimIfNoPending(claim: InsertClaim): Promise<{ success: boolean; claim?: Claim; error?: string }>;
  
  // Rate limiting operations
  getRateLimit(walletAddress: string): Promise<RateLimit | undefined>;
  createOrUpdateRateLimit(rateLimit: InsertRateLimit): Promise<RateLimit>;
  snapshotRateLimit(walletAddress: string): Promise<RateLimit | undefined>;
  restoreRateLimit(snapshot: RateLimit): Promise<void>;
  
  // Faucet configuration
  getFaucetConfig(): Promise<FaucetConfig | undefined>;
  updateFaucetConfig(config: Partial<InsertFaucetConfig>): Promise<FaucetConfig | undefined>;
  adjustFaucetBalance(delta: number): Promise<{ success: boolean; newBalance?: string; error?: string }>;
  
  // Daily pool management
  getRemainingDailyPool(): Promise<{ remaining: string; total: string; isExhausted: boolean }>;
  updateDailyDistributed(amount: string): Promise<{ success: boolean; remaining?: string; error?: string }>;
  getEligibleClaimAmount(transactionCount: number, walletBalance: string): Promise<{ amount: string; eligible: boolean; reason?: string }>;
  
  // Atomic claim processing
  processClaimAtomic(claim: InsertClaim, transactionCount: number, walletBalance: string): Promise<{ success: boolean; claim?: Claim; remaining?: string; error?: string }>;
  finalizeClaim(claimId: string, outcome: { success: boolean; txHash?: string | null }): Promise<{ success: boolean; error?: string }>;
  
  // Wallet eligibility operations
  getWalletEligibility(walletAddress: string): Promise<WalletEligibility | undefined>;
  upsertWalletEligibility(eligibility: InsertWalletEligibility): Promise<WalletEligibility>;
  
  // Bonus token operations
  createBonusClaim(bonusClaim: InsertBonusClaim): Promise<BonusClaim>;
  getBonusClaimsByWallet(walletAddress: string): Promise<BonusClaim[]>;
  updateBonusClaimStatus(id: string, status: "pending" | "success" | "failed", transactionHash?: string): Promise<BonusClaim | undefined>;
  calculateBonusAmount(fogoAmount: string): Promise<{ bonusAmount: string; conversionRate: string }>;
  processBonusClaimAtomic(bonusClaim: InsertBonusClaim): Promise<{ success: boolean; bonusClaim?: BonusClaim; error?: string }>;
  finalizeBonusClaim(bonusClaimId: string, outcome: { success: boolean; txHash?: string | null }): Promise<{ success: boolean; error?: string }>;
  
  // Bonus distribution tracking
  getBonusDistributionStats(): Promise<BonusDistributionStats | undefined>;
  updateBonusDistributionStats(bonusAmount: string): Promise<{ success: boolean; error?: string }>;
  getTotalBonusDistributed(): Promise<string>;
  
  // Analytics
  getTotalClaims(): Promise<number>;
  getTotalUsers(): Promise<number>;
  getTotalDistributed(): Promise<string>;
  getWalletTotalDistributed(walletAddress: string): Promise<string>;
  getLeaderboard(limit?: number): Promise<Array<{ walletAddress: string; claims: number; totalAmount: string; lastClaim: Date }>>;
  getClaimStats(): Promise<Array<{ date: string; claims: number; users: number }>>;
}

export class DatabaseStorage implements IStorage {
  constructor() {}

  // Initialize default faucet config if it doesn't exist
  private async ensureFaucetConfig(): Promise<void> {
    // Query directly to avoid infinite recursion
    const [existing] = await db.select().from(faucetConfig).limit(1);
    if (!existing) {
      const now = new Date();
      await db.insert(faucetConfig).values({
        balance: "1000000",
        dailyLimit: getDailyPoolLimit().toString(), // Use configurable daily pool limit from env
        dailyDistributed: "0",
        dailyResetDate: now,
        isActive: true,
        lastRefill: now,
        updatedAt: now
      });
    }
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Claim operations
  async createClaim(insertClaim: InsertClaim): Promise<Claim> {
    const [claim] = await db.insert(claims).values({
      ...insertClaim,
      status: insertClaim.status || "pending"
    }).returning();
    return claim;
  }

  async getClaimsByWallet(walletAddress: string): Promise<Claim[]> {
    return await db.select().from(claims)
      .where(sql`LOWER(${claims.walletAddress}) = LOWER(${walletAddress})`);
  }

  async getRecentClaims(limit = 10): Promise<Claim[]> {
    return await db.select().from(claims)
      .orderBy(desc(claims.createdAt))
      .limit(limit);
  }

  async updateClaimStatus(id: string, status: string, transactionHash?: string): Promise<Claim | undefined> {
    const updateData: any = {
      status: status as "pending" | "success" | "failed",
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
  }

  async getPendingClaimsByWallet(walletAddress: string): Promise<Claim[]> {
    return await db.select().from(claims)
      .where(and(
        sql`LOWER(${claims.walletAddress}) = LOWER(${walletAddress})`,
        eq(claims.status, "pending")
      ));
  }

  async createClaimIfNoPending(insertClaim: InsertClaim): Promise<{ success: boolean; claim?: Claim; error?: string }> {
    const walletAddress = insertClaim.walletAddress.toLowerCase();
    
    // Check for existing pending claims
    const existingPendingClaims = await this.getPendingClaimsByWallet(walletAddress);
    
    if (existingPendingClaims.length > 0) {
      return { 
        success: false, 
        error: "You have a pending claim. Please wait for it to complete before making another claim." 
      };
    }
    
    // Create new claim
    const claim = await this.createClaim(insertClaim);
    return { success: true, claim };
  }

  // Rate limiting operations
  async getRateLimit(walletAddress: string): Promise<RateLimit | undefined> {
    const [rateLimit] = await db.select().from(rateLimits)
      .where(sql`LOWER(${rateLimits.walletAddress}) = LOWER(${walletAddress})`);
    return rateLimit || undefined;
  }

  async createOrUpdateRateLimit(insertRateLimit: InsertRateLimit): Promise<RateLimit> {
    const walletAddress = insertRateLimit.walletAddress.toLowerCase();
    
    try {
      // Try to update existing rate limit first
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
      
      // If no existing record, create new one
      const [rateLimit] = await db.insert(rateLimits).values({
        ...insertRateLimit,
        walletAddress: walletAddress,
        lastClaim: new Date(),
        claimCount: insertRateLimit.claimCount || 1
      }).returning();
      return rateLimit;
    } catch (error) {
      // Handle race condition - try to get existing record if insert failed due to conflict
      const existingRateLimit = await this.getRateLimit(walletAddress);
      if (existingRateLimit) {
        // Update the existing record that was created concurrently
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
      throw error; // Re-throw if we can't handle the error
    }
  }

  async snapshotRateLimit(walletAddress: string): Promise<RateLimit | undefined> {
    return await this.getRateLimit(walletAddress);
  }

  async restoreRateLimit(snapshot: RateLimit): Promise<void> {
    await db.update(rateLimits)
      .set({
        lastClaim: snapshot.lastClaim,
        claimCount: snapshot.claimCount,
        resetDate: snapshot.resetDate
      })
      .where(eq(rateLimits.id, snapshot.id));
  }

  // Faucet configuration
  async getFaucetConfig(): Promise<FaucetConfig | undefined> {
    await this.ensureFaucetConfig();
    const [config] = await db.select().from(faucetConfig).limit(1);
    return config || undefined;
  }

  async updateFaucetConfig(config: Partial<InsertFaucetConfig>): Promise<FaucetConfig | undefined> {
    const existing = await this.getFaucetConfig();
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
  }

  // Atomic balance adjustment to prevent race conditions
  async adjustFaucetBalance(delta: number): Promise<{ success: boolean; newBalance?: string; error?: string }> {
    await this.ensureFaucetConfig();
    
    try {
      // Perform atomic update with balance check in SQL
      const [updatedConfig] = await db.update(faucetConfig)
        .set({
          balance: sql`CAST(balance AS DECIMAL) + ${delta}`,
          updatedAt: new Date()
        })
        .where(sql`CAST(balance AS DECIMAL) + ${delta} >= 0`) // Ensure non-negative balance
        .returning();

      if (!updatedConfig) {
        return { success: false, error: "Insufficient balance for this operation" };
      }

      return { success: true, newBalance: updatedConfig.balance };
    } catch (error) {
      return { success: false, error: "Failed to adjust balance" };
    }
  }

  // Wallet eligibility operations
  async getWalletEligibility(walletAddress: string): Promise<WalletEligibility | undefined> {
    const [eligibility] = await db.select().from(walletEligibility)
      .where(sql`LOWER(${walletEligibility.walletAddress}) = LOWER(${walletAddress})`);
    return eligibility || undefined;
  }

  async upsertWalletEligibility(insertEligibility: InsertWalletEligibility): Promise<WalletEligibility> {
    const walletAddress = insertEligibility.walletAddress.toLowerCase();
    const existing = await this.getWalletEligibility(walletAddress);
    
    if (existing) {
      const [updatedEligibility] = await db.update(walletEligibility)
        .set({
          isEligible: insertEligibility.isEligible ?? existing.isEligible,
          lastClaimAt: insertEligibility.lastClaimAt || existing.lastClaimAt,
          transactionCount: insertEligibility.transactionCount ?? existing.transactionCount,
          updatedAt: new Date()
        })
        .where(eq(walletEligibility.walletAddress, existing.walletAddress))
        .returning();
      return updatedEligibility;
    } else {
      const [newEligibility] = await db.insert(walletEligibility).values({
        walletAddress,
        isEligible: insertEligibility.isEligible ?? true,
        lastClaimAt: insertEligibility.lastClaimAt || null,
        transactionCount: insertEligibility.transactionCount ?? 0,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      return newEligibility;
    }
  }

  // Analytics
  async getTotalClaims(): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(claims);
    return result.count;
  }

  async getTotalUsers(): Promise<number> {
    const [result] = await db.select({
      count: sql<number>`count(DISTINCT LOWER(${claims.walletAddress}))`
    }).from(claims);
    return result.count;
  }

  async getTotalDistributed(): Promise<string> {
    const [result] = await db.select({
      total: sql<string>`COALESCE(SUM(CAST(${claims.amount} AS DECIMAL)), 0)`
    }).from(claims).where(eq(claims.status, "success"));
    return parseFloat(result.total || "0").toFixed(8);
  }

  async getWalletTotalDistributed(walletAddress: string): Promise<string> {
    const [result] = await db.select({
      total: sql<string>`COALESCE(SUM(CAST(${claims.amount} AS DECIMAL)), 0)`
    }).from(claims)
    .where(and(
      sql`LOWER(${claims.walletAddress}) = LOWER(${walletAddress})`,
      eq(claims.status, "success")
    ));
    return parseFloat(result.total || "0").toFixed(8);
  }

  async getLeaderboard(limit = 10): Promise<Array<{ walletAddress: string; claims: number; totalAmount: string; lastClaim: Date }>> {
    const results = await db.select({
      walletAddress: sql<string>`MIN(${claims.walletAddress})`, // Use MIN to get consistent wallet address case
      claimCount: sql<number>`count(*)`,
      totalAmount: sql<string>`COALESCE(SUM(CAST(${claims.amount} AS DECIMAL)), 0)`,
      lastClaim: sql<string>`MAX(${claims.createdAt})`
    })
    .from(claims)
    .where(eq(claims.status, "success"))
    .groupBy(sql`LOWER(${claims.walletAddress})`)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
    
    return results.map(result => ({
      walletAddress: result.walletAddress,
      claims: result.claimCount,
      totalAmount: parseFloat(result.totalAmount || "0").toFixed(8),
      lastClaim: new Date(result.lastClaim) // Convert string to Date object
    }));
  }

  async getClaimStats(): Promise<Array<{ date: string; claims: number; users: number }>> {
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
  }
  
  // Daily pool management methods
  async getRemainingDailyPool(): Promise<{ remaining: string; total: string; isExhausted: boolean }> {
    // Use SQL arithmetic to calculate remaining pool precisely with proper UTC reset logic
    const now = new Date();
    const [result] = await db.select({
      remaining: sql<string>`GREATEST(
        CAST(${faucetConfig.dailyLimit} AS DECIMAL) - CASE 
          WHEN date_trunc('day', ${faucetConfig.dailyResetDate} AT TIME ZONE 'UTC') < date_trunc('day', ${now} AT TIME ZONE 'UTC')
          THEN 0 
          ELSE CAST(${faucetConfig.dailyDistributed} AS DECIMAL)
        END, 0
      )`,
      total: faucetConfig.dailyLimit
    }).from(faucetConfig).limit(1);
    
    if (!result) {
      return { remaining: "0", total: "300", isExhausted: true };
    }
    
    const remainingAmount = parseFloat(result.remaining);
    
    return {
      remaining: remainingAmount.toFixed(8),
      total: result.total,
      isExhausted: remainingAmount <= 0
    };
  }
  
  
  // DEPRECATED: Use processClaimAtomic instead for atomic operations
  async updateDailyDistributed(amount: string): Promise<{ success: boolean; remaining?: string; error?: string }> {
    // This method is deprecated in favor of processClaimAtomic for better atomicity
    return { success: false, error: "Use processClaimAtomic for atomic claim processing" };
  }
  
  async getEligibleClaimAmount(transactionCount: number, walletBalance: string): Promise<{ amount: string; eligible: boolean; reason?: string }> {
    // Check wallet balance restriction (>10 FOGO cannot claim)
    const balance = parseFloat(walletBalance);
    if (balance > 10) {
      return {
        amount: "0",
        eligible: false,
        reason: "Not eligible"
      };
    }
    
    // Transaction-based claim scaling
    let claimAmount: string;
    
    if (transactionCount < 70) {
      return {
        amount: "0",
        eligible: false,
        reason: "Not eligible"
      };
    } else if (transactionCount >= 70 && transactionCount < 160) {
      claimAmount = "0.2";
    } else if (transactionCount >= 160 && transactionCount < 400) {
      claimAmount = "0.5";
    } else if (transactionCount >= 400 && transactionCount < 1000) {
      claimAmount = "1.0";
    } else if (transactionCount >= 1000 && transactionCount < 1500) {
      claimAmount = "1.5";
    } else if (transactionCount >= 1500 && transactionCount < 3000) {
      claimAmount = "2.0";
    } else { // 3000+
      claimAmount = "3.0";
    }
    
    // Use SQL to atomically check pool and calculate final amount
    const [result] = await db.select({
      remaining: sql<string>`GREATEST(CAST(${faucetConfig.dailyLimit} AS DECIMAL) - CAST(${faucetConfig.dailyDistributed} AS DECIMAL), 0)`,
      finalAmount: sql<string>`LEAST(CAST(${claimAmount} AS DECIMAL), GREATEST(CAST(${faucetConfig.dailyLimit} AS DECIMAL) - CAST(${faucetConfig.dailyDistributed} AS DECIMAL), 0))`
    }).from(faucetConfig).limit(1);
    
    if (!result) {
      return {
        amount: "0",
        eligible: false,
        reason: "Faucet configuration not found"
      };
    }
    
    const remainingPool = parseFloat(result.remaining);
    const finalAmount = parseFloat(result.finalAmount);
    
    if (remainingPool <= 0) {
      return {
        amount: "0",
        eligible: false,
        reason: "Target has reached. Try again tomorrow."
      };
    }
    
    return {
      amount: finalAmount.toFixed(8),
      eligible: true
    };
  }
  
  // Atomic claim processing - handles entire claim operation in single transaction with full SQL arithmetic
  async processClaimAtomic(insertClaim: InsertClaim, transactionCount: number, walletBalance: string): Promise<{ success: boolean; claim?: Claim; remaining?: string; error?: string }> {
    // Validate input constraints before transaction
    if (parseFloat(walletBalance) > 10) {
      return { success: false, error: "Not eligible" };
    }
    
    if (transactionCount < 70) {
      return { success: false, error: "Not eligible" };
    }
    
    // Calculate base claim amount based on transaction count
    let baseClaimAmount: string;
    if (transactionCount >= 70 && transactionCount < 160) {
      baseClaimAmount = "0.2";
    } else if (transactionCount >= 160 && transactionCount < 400) {
      baseClaimAmount = "0.5";
    } else if (transactionCount >= 400 && transactionCount < 1000) {
      baseClaimAmount = "1.0";
    } else if (transactionCount >= 1000 && transactionCount < 1500) {
      baseClaimAmount = "1.5";
    } else if (transactionCount >= 1500 && transactionCount < 3000) {
      baseClaimAmount = "2.0";
    } else { // 3000+
      baseClaimAmount = "3.0";
    }
    
    // Start atomic transaction
    return await db.transaction(async (tx) => {
      const now = new Date();
      
      // We will rely on the unique constraint to prevent duplicate pending claims when inserting
      
      // Atomic CTE: Lock config row, check/reset daily pool, compute awarded amount, update distributed, and return all needed values
      const result = await tx.execute(sql`
        WITH config_update AS (
          SELECT 
            id,
            balance,
            daily_limit,
            daily_distributed,
            daily_reset_date,
            -- Check if we need to reset (UTC midnight comparison)
            CASE 
              WHEN date_trunc('day', daily_reset_date AT TIME ZONE 'UTC') < date_trunc('day', ${now} AT TIME ZONE 'UTC')
              THEN 0 -- Reset distributed amount
              ELSE daily_distributed
            END as current_distributed,
            -- Calculate the award amount (base claim capped by remaining pool)
            LEAST(
              CAST(${baseClaimAmount} AS DECIMAL),
              GREATEST(
                daily_limit - CASE 
                  WHEN date_trunc('day', daily_reset_date AT TIME ZONE 'UTC') < date_trunc('day', ${now} AT TIME ZONE 'UTC')
                  THEN 0 
                  ELSE daily_distributed
                END,
                0
              )
            ) as awarded_amount
          FROM ${faucetConfig}
          FOR UPDATE -- Lock the row to prevent concurrency issues
        ),
        balance_check AS (
          SELECT *
          FROM config_update
          WHERE 
            config_update.balance >= config_update.awarded_amount -- Ensure sufficient faucet balance
            AND config_update.awarded_amount > 0 -- Ensure there's something to award
        ),
        faucet_update AS (
          UPDATE ${faucetConfig}
          SET 
            daily_distributed = balance_check.current_distributed + balance_check.awarded_amount,
            daily_reset_date = CASE 
              WHEN balance_check.current_distributed = 0 -- If we reset
              THEN date_trunc('day', ${now} AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
              ELSE ${faucetConfig}.daily_reset_date
            END,
            balance = ${faucetConfig}.balance - balance_check.awarded_amount,
            updated_at = ${now}
          FROM balance_check
          WHERE ${faucetConfig}.id = balance_check.id
          RETURNING 
            balance_check.awarded_amount,
            balance_check.daily_limit - (balance_check.current_distributed + balance_check.awarded_amount) as remaining_pool,
            balance_check.daily_limit,
            balance_check.current_distributed + balance_check.awarded_amount as daily_distributed,
            balance_check.balance - balance_check.awarded_amount as final_balance
        )
        SELECT 
          awarded_amount,
          remaining_pool,
          daily_limit,
          daily_distributed,
          final_balance
        FROM faucet_update
      `);
      
      const claimResult = result.rows[0];
      if (!claimResult || !claimResult.awarded_amount || parseFloat(claimResult.awarded_amount as string) <= 0) {
        throw new Error("Target has reached. Try again tomorrow.");
      }
      
      const awardedAmount = claimResult.awarded_amount as string;
      const remainingPool = claimResult.remaining_pool as string;
      
      // Create the claim record with the exact awarded amount from SQL
      // This will fail if there's already a pending claim due to the unique constraint
      const [newClaim] = await tx.insert(claims).values({
        ...insertClaim,
        amount: awardedAmount,
        status: insertClaim.status || "pending"
      }).returning();
      
      return {
        success: true,
        claim: newClaim,
        remaining: parseFloat(remainingPool).toFixed(8)
      };
    }).catch((error) => {
      // Handle database constraint violations gracefully
      if (error.message?.includes("unique_pending_per_wallet") || error.code === '23505') {
        return {
          success: false,
          error: "You have a pending claim. Please wait for it to complete before making another claim."
        };
      }
      
      return {
        success: false,
        error: error.message || "Transaction failed"
      };
    });
  }

  async finalizeClaim(claimId: string, outcome: { success: boolean; txHash?: string | null }): Promise<{ success: boolean; error?: string }> {
    try {
      return await db.transaction(async (tx) => {
        // Idempotent update: only update if status is still pending
        const [claim] = await tx.update(claims).set({
          status: outcome.success ? "success" : "failed",
          transactionHash: outcome.txHash,
          updatedAt: new Date()
        }).where(and(
          eq(claims.id, claimId),
          eq(claims.status, "pending")
        )).returning();

        if (!claim) {
          // Claim not found or already finalized - idempotent success
          return { success: true };
        }

        const claimAmount = parseFloat(claim.amount);

        if (outcome.success) {
          // Update rate limit (create or reset for 24h window)
          const now = new Date();
          const resetDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          
          const [existingRateLimit] = await tx.select().from(rateLimits)
            .where(eq(rateLimits.walletAddress, claim.walletAddress));

          if (existingRateLimit) {
            const timeSinceLastClaim = now.getTime() - existingRateLimit.lastClaim.getTime();
            const twentyFourHours = 24 * 60 * 60 * 1000;
            const newClaimCount = timeSinceLastClaim >= twentyFourHours ? 1 : existingRateLimit.claimCount + 1;

            await tx.update(rateLimits).set({
              claimCount: newClaimCount,
              lastClaim: now,
              resetDate
            }).where(eq(rateLimits.walletAddress, claim.walletAddress));
          } else {
            await tx.insert(rateLimits).values({
              walletAddress: claim.walletAddress,
              claimCount: 1,
              lastClaim: now,
              resetDate
            });
          }

          return { success: true };
        } else {
          // On failure, compensate by restoring the daily pool and balance
          await tx.execute(sql`
            UPDATE ${faucetConfig} 
            SET 
              balance = ${faucetConfig}.balance + ${claimAmount},
              daily_distributed = GREATEST(daily_distributed - ${claimAmount}, 0),
              updated_at = ${new Date()}
            WHERE id = (SELECT id FROM ${faucetConfig} LIMIT 1)
          `);

          return { success: true };
        }
      });
    } catch (error) {
      console.error("Failed to finalize claim:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to finalize claim"
      };
    }
  }

  // Bonus token operations
  async createBonusClaim(insertBonusClaim: InsertBonusClaim): Promise<BonusClaim> {
    const [bonusClaim] = await db.insert(bonusClaims).values({
      ...insertBonusClaim,
      status: insertBonusClaim.status || "pending"
    }).returning();
    return bonusClaim;
  }

  async getBonusClaimsByWallet(walletAddress: string): Promise<BonusClaim[]> {
    return await db.select().from(bonusClaims)
      .where(sql`LOWER(${bonusClaims.walletAddress}) = LOWER(${walletAddress})`);
  }

  async updateBonusClaimStatus(id: string, status: "pending" | "success" | "failed", transactionHash?: string): Promise<BonusClaim | undefined> {
    const [bonusClaim] = await db.update(bonusClaims).set({
      status,
      transactionHash,
      updatedAt: new Date()
    }).where(eq(bonusClaims.id, id)).returning();
    return bonusClaim || undefined;
  }

  async calculateBonusAmount(fogoAmount: string): Promise<{ bonusAmount: string; conversionRate: string }> {
    const fogoFloat = parseFloat(fogoAmount);
    const rate = getFogoToBonusRate();
    const conversionRate = rate.toString();
    const bonusAmount = (fogoFloat * rate).toString();
    
    return {
      bonusAmount,
      conversionRate
    };
  }

  async processBonusClaimAtomic(insertBonusClaim: InsertBonusClaim): Promise<{ success: boolean; bonusClaim?: BonusClaim; error?: string }> {
    try {
      return await db.transaction(async (tx) => {
        // Insert bonus claim
        const [bonusClaim] = await tx.insert(bonusClaims).values(insertBonusClaim).returning();
        
        // Update bonus distribution stats
        await this.updateBonusDistributionStatsInTransaction(tx, insertBonusClaim.bonusAmount);
        
        return { success: true, bonusClaim };
      });
    } catch (error) {
      console.error("Failed to process bonus claim atomically:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to process bonus claim"
      };
    }
  }

  async finalizeBonusClaim(bonusClaimId: string, outcome: { success: boolean; txHash?: string | null }): Promise<{ success: boolean; error?: string }> {
    try {
      const [bonusClaim] = await db.update(bonusClaims).set({
        status: outcome.success ? "success" : "failed",
        transactionHash: outcome.txHash,
        updatedAt: new Date()
      }).where(and(
        eq(bonusClaims.id, bonusClaimId),
        eq(bonusClaims.status, "pending")
      )).returning();

      if (!bonusClaim) {
        // Bonus claim not found or already finalized - idempotent success
        return { success: true };
      }

      if (!outcome.success) {
        // On failure, compensate by reducing the bonus distribution stats
        const bonusAmount = parseFloat(bonusClaim.bonusAmount);
        await this.compensateBonusDistributionStats(bonusAmount);
      }

      return { success: true };
    } catch (error) {
      console.error("Failed to finalize bonus claim:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to finalize bonus claim"
      };
    }
  }

  // Bonus distribution tracking
  async getBonusDistributionStats(): Promise<BonusDistributionStats | undefined> {
    await this.ensureBonusDistributionStats();
    const [stats] = await db.select().from(bonusDistributionStats).limit(1);
    return stats || undefined;
  }

  async updateBonusDistributionStats(bonusAmount: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.ensureBonusDistributionStats();
      
      const bonusFloat = parseFloat(bonusAmount);
      await db.execute(sql`
        UPDATE ${bonusDistributionStats} 
        SET 
          total_bonus_distributed = total_bonus_distributed + ${bonusFloat},
          total_bonus_claims = total_bonus_claims + 1,
          last_updated = ${new Date()}
        WHERE id = (SELECT id FROM ${bonusDistributionStats} LIMIT 1)
      `);
      
      return { success: true };
    } catch (error) {
      console.error("Failed to update bonus distribution stats:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update bonus distribution stats"
      };
    }
  }

  async getTotalBonusDistributed(): Promise<string> {
    const stats = await this.getBonusDistributionStats();
    return stats?.totalBonusDistributed || "0";
  }

  // Helper methods for bonus distribution
  private async ensureBonusDistributionStats(): Promise<void> {
    const [existing] = await db.select().from(bonusDistributionStats).limit(1);
    if (!existing) {
      await db.insert(bonusDistributionStats).values({
        totalBonusDistributed: "0",
        totalBonusClaims: 0,
        lastUpdated: new Date()
      });
    }
  }

  private async updateBonusDistributionStatsInTransaction(tx: any, bonusAmount: string): Promise<void> {
    const bonusFloat = parseFloat(bonusAmount);
    
    // Ensure stats exist
    const [existing] = await tx.select().from(bonusDistributionStats).limit(1);
    if (!existing) {
      await tx.insert(bonusDistributionStats).values({
        totalBonusDistributed: bonusAmount,
        totalBonusClaims: 1,
        lastUpdated: new Date()
      });
    } else {
      await tx.execute(sql`
        UPDATE ${bonusDistributionStats} 
        SET 
          total_bonus_distributed = total_bonus_distributed + ${bonusFloat},
          total_bonus_claims = total_bonus_claims + 1,
          last_updated = ${new Date()}
        WHERE id = (SELECT id FROM ${bonusDistributionStats} LIMIT 1)
      `);
    }
  }

  private async compensateBonusDistributionStats(bonusAmount: number): Promise<void> {
    await db.execute(sql`
      UPDATE ${bonusDistributionStats} 
      SET 
        total_bonus_distributed = GREATEST(total_bonus_distributed - ${bonusAmount}, 0),
        total_bonus_claims = GREATEST(total_bonus_claims - 1, 0),
        last_updated = ${new Date()}
      WHERE id = (SELECT id FROM ${bonusDistributionStats} LIMIT 1)
    `);
  }
}

export const storage = new DatabaseStorage();