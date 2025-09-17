import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, decimal, boolean } from "drizzle-orm/pg-core";
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
});

// Faucet configuration and status
export const faucetConfig = pgTable("faucet_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  balance: decimal("balance", { precision: 18, scale: 8 }).notNull().default("1000000"), // 1M FOGO
  dailyLimit: decimal("daily_limit", { precision: 18, scale: 8 }).notNull().default("100"), // 100 FOGO per day
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
});

// Wallet eligibility table for cooldowns and tracking
export const walletEligibility = pgTable("wallet_eligibility", {
  walletAddress: text("wallet_address").primaryKey(),
  isEligible: boolean("is_eligible").notNull().default(true),
  lastClaimAt: timestamp("last_claim_at"),
  transactionCount: integer("transaction_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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

export const insertFaucetConfigSchema = createInsertSchema(faucetConfig).pick({
  balance: true,
  dailyLimit: true,
  isActive: true,
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
