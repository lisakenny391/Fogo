import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, decimal, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table for basic authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Claims table for tracking token distributions
export const claims = pgTable("claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull(),
  amount: decimal("amount", { precision: 18, scale: 8 }).notNull(), // Support crypto decimals
  transactionHash: text("transaction_hash"),
  status: text("status", { enum: ["pending", "success", "failed"] }).notNull().default("pending"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Unique partial index to prevent duplicate pending claims per wallet (database-enforced)
  uniquePendingPerWallet: uniqueIndex("unique_pending_per_wallet").on(sql`LOWER(${table.walletAddress})`).where(sql`${table.status} = 'pending'`),
}));

// Faucet configuration and status
export const faucetConfig = pgTable("faucet_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  balance: decimal("balance", { precision: 18, scale: 8 }).notNull().default("1000000"), // 1M FOGO
  dailyLimit: decimal("daily_limit", { precision: 18, scale: 8 }).notNull().default("300"), // 300 FOGO per day
  dailyDistributed: decimal("daily_distributed", { precision: 18, scale: 8 }).notNull().default("0"), // Amount distributed today
  dailyResetDate: timestamp("daily_reset_date", { withTimezone: true }).defaultNow().notNull(), // When the daily pool resets (UTC)
  isActive: boolean("is_active").notNull().default(true),
  lastRefill: timestamp("last_refill").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Rate limiting table
export const rateLimits = pgTable("rate_limits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull(),
  lastClaim: timestamp("last_claim").defaultNow().notNull(),
  claimCount: integer("claim_count").notNull().default(1),
  resetDate: timestamp("reset_date").notNull(),
}, (table) => ({
  // Index on wallet address for rate limiting lookups
  walletAddressIdx: index("rate_limits_address_idx").on(sql`LOWER(${table.walletAddress})`),
}));

// Wallet eligibility table for cooldowns and tracking
export const walletEligibility = pgTable("wallet_eligibility", {
  walletAddress: text("wallet_address").primaryKey(),
  isEligible: boolean("is_eligible").notNull().default(true),
  lastClaimAt: timestamp("last_claim_at"),
  transactionCount: integer("transaction_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Index on wallet address for faster lookups
  walletAddressIdx: index("wallet_eligibility_address_idx").on(sql`LOWER(${table.walletAddress})`),
}));

// Bonus claims table for tracking bonus token distributions
export const bonusClaims = pgTable("bonus_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull(),
  fogoAmount: decimal("fogo_amount", { precision: 18, scale: 8 }).notNull(), // The FOGO tier amount that triggered bonus
  bonusAmount: decimal("bonus_amount", { precision: 18, scale: 8 }).notNull(), // Calculated bonus token amount
  conversionRate: decimal("conversion_rate", { precision: 18, scale: 8 }).notNull(), // Rate used for calculation
  transactionHash: text("transaction_hash"),
  status: text("status", { enum: ["pending", "success", "failed"] }).notNull().default("pending"),
  relatedClaimId: varchar("related_claim_id"), // Link to the main FOGO claim
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Index on wallet address for bonus claims lookups
  walletAddressIdx: index("bonus_claims_address_idx").on(sql`LOWER(${table.walletAddress})`),
  // Index on related claim ID for linking
  relatedClaimIdx: index("bonus_claims_related_claim_idx").on(table.relatedClaimId),
}));

// Bonus distribution tracking for platform analytics
export const bonusDistributionStats = pgTable("bonus_distribution_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  totalBonusDistributed: decimal("total_bonus_distributed", { precision: 18, scale: 8 }).notNull().default("0"),
  totalBonusClaims: integer("total_bonus_claims").notNull().default(0),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

// Create insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertClaimSchema = createInsertSchema(claims).pick({
  walletAddress: true,
  amount: true,
  transactionHash: true,
  status: true,
  ipAddress: true,
});

export const insertFaucetConfigSchema = createInsertSchema(faucetConfig).omit({
  id: true,
  lastRefill: true,
  updatedAt: true,
});

export const insertRateLimitSchema = createInsertSchema(rateLimits).pick({
  walletAddress: true,
  claimCount: true,
  resetDate: true,
});

export const insertWalletEligibilitySchema = createInsertSchema(walletEligibility).pick({
  walletAddress: true,
  isEligible: true,
  lastClaimAt: true,
  transactionCount: true,
});

export const insertBonusClaimSchema = createInsertSchema(bonusClaims).pick({
  walletAddress: true,
  fogoAmount: true,
  bonusAmount: true,
  conversionRate: true,
  transactionHash: true,
  status: true,
  relatedClaimId: true,
});

export const insertBonusDistributionStatsSchema = createInsertSchema(bonusDistributionStats).pick({
  totalBonusDistributed: true,
  totalBonusClaims: true,
});

// Type exports
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertClaim = z.infer<typeof insertClaimSchema>;
export type Claim = typeof claims.$inferSelect;
export type InsertFaucetConfig = z.infer<typeof insertFaucetConfigSchema>;
export type FaucetConfig = typeof faucetConfig.$inferSelect;
export type InsertRateLimit = z.infer<typeof insertRateLimitSchema>;
export type RateLimit = typeof rateLimits.$inferSelect;
export type InsertWalletEligibility = z.infer<typeof insertWalletEligibilitySchema>;
export type WalletEligibility = typeof walletEligibility.$inferSelect;
export type InsertBonusClaim = z.infer<typeof insertBonusClaimSchema>;
export type BonusClaim = typeof bonusClaims.$inferSelect;
export type InsertBonusDistributionStats = z.infer<typeof insertBonusDistributionStatsSchema>;
export type BonusDistributionStats = typeof bonusDistributionStats.$inferSelect;
