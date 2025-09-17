import { type User, type InsertUser, type Claim, type InsertClaim, type FaucetConfig, type InsertFaucetConfig, type RateLimit, type InsertRateLimit, type WalletEligibility, type InsertWalletEligibility } from "@shared/schema";
import { users, claims, faucetConfig, rateLimits, walletEligibility } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

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
  
  // Wallet eligibility operations
  getWalletEligibility(walletAddress: string): Promise<WalletEligibility | undefined>;
  upsertWalletEligibility(eligibility: InsertWalletEligibility): Promise<WalletEligibility>;
  
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
      await db.insert(faucetConfig).values({
        balance: "1000000",
        dailyLimit: "100",
        isActive: true,
        lastRefill: new Date(),
        updatedAt: new Date()
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
      lastClaim: sql<Date>`MAX(${claims.createdAt})`
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
      lastClaim: result.lastClaim
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
}

export const storage = new DatabaseStorage();