import type { VercelRequest, VercelResponse } from '@vercel/node';
import { storage } from '../../server/storage';
import { web3Service } from '../../server/web3Service';
import { z } from 'zod';
import { claimTokensSchema, checkDualFogoEligibility, getRealTransactionCount, getRealWalletBalance, setCORSHeaders } from '../../lib/shared';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCORSHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { walletAddress } = claimTokensSchema.parse(req.body);
    
    const config = await storage.getFaucetConfig();
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
    
    const claimResult = await storage.processClaimAtomic({
      walletAddress,
      amount: "0",
      status: "pending"
    }, txnCount, walletBalance.toString());
    
    if (!claimResult.success) {
      return res.status(400).json({ error: claimResult.error });
    }
    
    const claim = claimResult.claim!;
    const claimedAmount = claim.amount;
    
    const bonusCalculation = await storage.calculateBonusAmount(claimedAmount);
    const bonusAmount = bonusCalculation.bonusAmount;
    const conversionRate = bonusCalculation.conversionRate;
    
    let bonusClaim: any = null;
    try {
      const bonusClaimResult = await storage.processBonusClaimAtomic({
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

    // Process blockchain transactions synchronously before responding
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
      
      // Finalize claims with transaction results
      await storage.finalizeClaim(claim.id, { success: fogoSuccess, txHash: fogoTxHash });
      
      if (bonusClaim) {
        await storage.finalizeBonusClaim(bonusClaim.id, { success: bonusSuccess, txHash: bonusTxHash });
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
      console.error(`Failed to complete claim:`, error);
      
      // Finalize claims as failed
      await storage.finalizeClaim(claim.id, { success: false, txHash: fogoTxHash });
      
      if (bonusClaim) {
        await storage.finalizeBonusClaim(bonusClaim.id, { success: false, txHash: bonusTxHash });
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
    res.status(500).json({ error: "Failed to process claim" });
  }
}