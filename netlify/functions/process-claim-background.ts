import { storage } from '../../server/storage';
import { web3Service } from '../../server/web3Service';

// This function can be called manually to trigger claim processing
// For production, you would typically call this via a webhook or queue system
export const handler = async (event: any, context: any) => {
  try {
    const { claimId, bonusClaimId } = JSON.parse(event.body || '{}');
    
    if (!claimId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing claimId' })
      };
    }

    console.log(`Processing claim ${claimId} and bonus claim ${bonusClaimId || 'none'}...`);

    // Get the main claim
    const claim = await storage.getClaimById(claimId);
    if (!claim) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Claim not found' })
      };
    }

    if (claim.status !== 'pending') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Claim is not in pending status' })
      };
    }

    let fogoTxHash: string | null = null;
    let bonusTxHash: string | null = null;
    let fogoSuccess = false;
    let bonusSuccess = false;

    try {
      // Process main FOGO claim
      fogoTxHash = await web3Service.sendTokens(claim.walletAddress, claim.amount);
      console.log(`FOGO transaction sent: ${fogoTxHash}`);
      fogoSuccess = true;
      
      // Use proper finalization for main claim
      await storage.finalizeClaim(claimId, { success: true, txHash: fogoTxHash });
      
      // Process bonus claim if provided
      if (bonusClaimId) {
        const bonusClaim = await storage.getClaimById(bonusClaimId);
        if (bonusClaim && bonusClaim.status === 'pending') {
          try {
            bonusTxHash = await web3Service.sendBonusTokens(claim.walletAddress, bonusClaim.amount);
            console.log(`Bonus token transaction sent: ${bonusTxHash}`);
            bonusSuccess = true;
            await storage.finalizeBonusClaim(bonusClaimId, { success: true, txHash: bonusTxHash });
          } catch (bonusError) {
            console.error(`Failed to send bonus tokens for claim ${bonusClaimId}:`, bonusError);
            await storage.finalizeBonusClaim(bonusClaimId, { success: false, txHash: null });
          }
        }
      }
      
      console.log(`Claim processing completed - FOGO: ${fogoSuccess ? 'success' : 'failed'}, Bonus: ${bonusSuccess ? 'success' : 'failed'}`);
      
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          success: true, 
          claimId,
          bonusClaimId,
          fogoTxHash,
          bonusTxHash,
          fogoSuccess,
          bonusSuccess
        })
      };
    } catch (error) {
      console.error(`Failed to process claim ${claimId}:`, error);
      
      // Use proper finalization for failed claims
      await storage.finalizeClaim(claimId, { success: false, txHash: null });
      if (bonusClaimId) {
        await storage.finalizeBonusClaim(bonusClaimId, { success: false, txHash: null });
      }
      
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Failed to process blockchain transaction',
          claimId,
          bonusClaimId 
        })
      };
    }
  } catch (error) {
    console.error('Background claim processing error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};