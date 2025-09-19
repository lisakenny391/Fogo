import type { VercelRequest, VercelResponse } from '@vercel/node';
import { web3Service } from '../../server/web3Service';
import { z } from 'zod';

// Validation schema
const checkWalletSchema = z.object({
  walletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana address format"),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { walletAddress } = checkWalletSchema.parse(req.body);
    
    console.log(`Enhanced balance check requested for: ${walletAddress}`);
    
    try {
      const balanceResult = await web3Service.getEnhancedFogoBalances(walletAddress);
      
      return res.json({
        success: true,
        wallet: walletAddress,
        balances: balanceResult
      });
      
    } catch (error: any) {
      console.error(`Enhanced balance check failed for ${walletAddress}:`, error);
      
      return res.status(500).json({
        success: false,
        error: "Failed to check balances",
        details: "Unable to verify wallet balances",
        wallet: walletAddress
      });
    }
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid wallet address format",
        details: error.errors
      });
    }
    console.error("Enhanced balance check validation error:", error);
    return res.status(500).json({ 
      success: false,
      error: "Request validation failed" 
    });
  }
}