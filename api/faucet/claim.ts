import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFaucetConfig, processClaimAtomic, calculateBonusAmount, processBonusClaimAtomic, finalizeClaim, finalizeBonusClaim } from '../lib/storage-utils';
import { web3Service } from '../../server/web3Service';
import { z } from 'zod';

// Environment variable validation
const DAILY_POOL_LIMIT = process.env.DAILY_POOL_LIMIT;
const FOGO_TO_BONUS = process.env.FOGO_TO_BONUS;

if (!DAILY_POOL_LIMIT || !FOGO_TO_BONUS) {
  throw new Error('Missing DAILY_POOL_LIMIT or FOGO_TO_BONUS in environment');
}

// Validation schema
const claimTokensSchema = z.object({
  walletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana address format"),
});

// Helper functions
const getRealWalletBalance = async (address: string): Promise<number> => {
  try {
    const balance = await web3Service.getWalletBalance(address);
    return parseFloat(balance);
  } catch (error) {
    console.error("Failed to get real wallet balance - RPC unavailable:", error);
    throw new Error("Unable to verify wallet balance - blockchain RPC unavailable");
  }
};

const checkDualFogoEligibility = async (address: string) => {
  try {
    return await web3Service.checkDualFogoBalance(address, 10);
  } catch (error) {
    console.error("Failed to check dual FOGO balance - RPC unavailable:", error);
    throw new Error("Unable to verify FOGO token balances - blockchain RPC unavailable");
  }
};

const getRealTransactionCount = async (address: string): Promise<number> => {
  try {
    return await web3Service.getTransactionCount(address);
  } catch (error) {
    console.error("Failed to get real transaction count - blockchain RPC unavailable:", error);
    throw new Error("Unable to verify wallet transaction count - blockchain RPC unavailable");
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { walletAddress } = claimTokensSchema.parse(req.body);
    
    const config = await getFaucetConfig();
    if (!config || !config.isActive) {
      return res.status(400).json({ error: "Faucet is currently inactive" });
    }
    
    const dualBalanceCheck = await checkDualFogoEligibility(walletAddress);
    if (!dualBalanceCheck.eligible) {
      const balanceType = dualBalanceCheck.exceededType === "native" ? "native FOGO" : "SPL FOGO";
      return res.status(400).json({ 
        error: `Wallet ${balanceType} balance exceeds 10 tokens (Native: ${dualBalanceCheck.nativeFogo}, SPL: ${dualBalanceCheck.splFogo})` 
      });
    }
    
    const txnCount = await getRealTransactionCount(walletAddress);
    const walletBalance = await getRealWalletBalance(walletAddress);
    
    const claimResult = await processClaimAtomic({
      walletAddress,
      amount: "0",
      status: "pending"
    }, txnCount, walletBalance.toString());
    
    if (!claimResult.success) {
      return res.status(400).json({ error: claimResult.error });
    }
    
    const claim = claimResult.claim!;
    const claimedAmount = claim.amount;
    
    const bonusCalculation = await calculateBonusAmount(claimedAmount);
    const bonusAmount = bonusCalculation.bonusAmount;
    const conversionRate = bonusCalculation.conversionRate;
    
    let bonusClaim: any = null;
    try {
      const bonusClaimResult = await processBonusClaimAtomic({
        walletAddress,
        fogoAmount: claimedAmount,
        bonusAmount,
        conversionRate,
        status: "pending",
        relatedClaimId: claim.id
      });
      
      if (bonusClaimResult.success) {
        bonusClaim = bonusClaimResult.bonusClaim;
      }
    } catch (error) {
      console.error("Failed to create bonus claim:", error);
    }

    // FIXED: Process blockchain transactions synchronously before responding
    // to ensure they complete in the serverless environment
    let fogoTxHash: string | null = null;
    let bonusTxHash: string | null = null;
    let fogoSuccess = false;
    let bonusSuccess = false;
    
    try {
      // Send FOGO tokens first
      fogoTxHash = await web3Service.sendTokens(walletAddress, claimedAmount);
      console.log(`FOGO transaction sent: ${fogoTxHash}`);
      fogoSuccess = true;
      
      // Send bonus tokens if bonus claim was created
      if (bonusClaim) {
        try {
          bonusTxHash = await web3Service.sendBonusTokens(walletAddress, bonusAmount);
          console.log(`Bonus token transaction sent: ${bonusTxHash}`);
          bonusSuccess = true;
        } catch (bonusError) {
          console.error(`Failed to send bonus tokens for claim ${claim.id}:`, bonusError);
          bonusSuccess = false;
        }
      }
      
      // Finalize claims
      await finalizeClaim(claim.id, { success: fogoSuccess, txHash: fogoTxHash });
      
      if (bonusClaim) {
        await finalizeBonusClaim(bonusClaim.id, { success: bonusSuccess, txHash: bonusTxHash });
      }
      
      console.log(`Claim ${claim.id} completed - FOGO: ${fogoSuccess ? 'success' : 'failed'}, Bonus: ${bonusSuccess ? 'success' : 'failed'}`);
      
      return res.json({ 
        claimId: claim.id, 
        amount: claimedAmount,
        bonusClaimId: bonusClaim?.id,
        bonusAmount,
        remaining: claimResult.remaining || "0",
        transactionHash: fogoTxHash,
        bonusTransactionHash: bonusTxHash,
        success: fogoSuccess,
        bonusSuccess,
        message: "Claim processed successfully" 
      });
      
    } catch (error) {
      console.error(`Failed to complete FOGO claim ${claim.id}:`, error);
      
      // Finalize claims as failed
      await finalizeClaim(claim.id, { success: false, txHash: fogoTxHash });
      
      if (bonusClaim) {
        await finalizeBonusClaim(bonusClaim.id, { success: false, txHash: bonusTxHash });
      }
      
      return res.status(500).json({ 
        error: "Failed to process blockchain transactions",
        claimId: claim.id,
        amount: claimedAmount
      });
    }
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request format" });
    }
    console.error("Claim error:", error);
    return res.status(500).json({ error: "Failed to process claim" });
  }
}