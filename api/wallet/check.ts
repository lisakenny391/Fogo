import type { VercelRequest, VercelResponse } from '@vercel/node';
import { web3Service } from '../../server/web3Service';
import { z } from 'zod';
import { checkEligibilitySchema, setCORSHeaders } from '../_shared';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCORSHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { walletAddress } = checkEligibilitySchema.parse(req.body);
    
    console.log(`Enhanced wallet check requested for: ${walletAddress}`);
    
    try {
      const walletResult = await web3Service.checkWallet(walletAddress);
      res.json(walletResult);
    } catch (error: any) {
      console.error(`Enhanced wallet check failed for ${walletAddress}:`, error);
      
      res.status(500).json({
        success: false,
        error: "Failed to check wallet",
        details: error.message,
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
    console.error("Enhanced wallet check validation error:", error);
    res.status(500).json({ 
      success: false,
      error: "Request validation failed" 
    });
  }
}