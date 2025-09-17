import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Coins, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { faucetApi } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface ClaimInterfaceProps {
  walletAddress?: string;
  isConnected?: boolean;
  onClaim?: (amount: string) => void;
}

export function ClaimInterface({ 
  walletAddress = "", 
  isConnected = false,
  onClaim 
}: ClaimInterfaceProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [eligibilityStatus, setEligibilityStatus] = useState<"idle" | "eligible" | "ineligible" | "cooldown">("idle");
  const [eligibilityData, setEligibilityData] = useState<any>(null);
  const [lastClaimTime, setLastClaimTime] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const checkEligibility = async () => {
    if (!isConnected || !walletAddress) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    setIsChecking(true);
    
    try {
      const result = await faucetApi.checkEligibility(walletAddress);
      
      setEligibilityData(result);
      if (result.eligible) {
        setEligibilityStatus("eligible");
        setLastClaimTime(null);
      } else {
        if (result.balanceExceeded) {
          setEligibilityStatus("ineligible");
        } else {
          setEligibilityStatus("cooldown");
        }
        setLastClaimTime(result.reason || "Recently claimed");
      }
    } catch (error) {
      console.error('Eligibility check failed:', error);
      setEligibilityStatus("ineligible");
      toast({
        title: "Check Failed",
        description: "Failed to check eligibility. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsChecking(false);
    }
  };

  const claimMutation = useMutation({
    mutationFn: () => faucetApi.claimTokens(walletAddress),
    onSuccess: (data) => {
      onClaim?.(eligibilityData?.proposedAmount || "0");
      setEligibilityStatus("cooldown");
      setLastClaimTime("Just now");
      
      toast({
        title: "Claim Submitted!",
        description: data.message,
      });
      
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/claims/recent'] });
      queryClient.invalidateQueries({ queryKey: ['/api/faucet/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leaderboard'] });
    },
    onError: (error: any) => {
      console.error('Claim failed:', error);
      toast({
        title: "Claim Failed",
        description: error.message || "Failed to claim tokens. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleClaim = async () => {
    if (eligibilityStatus !== "eligible" || !walletAddress) return;
    claimMutation.mutate();
  };

  const getEligibilityBadge = () => {
    switch (eligibilityStatus) {
      case "eligible":
        return (
          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
            <CheckCircle className="h-3 w-3 mr-1" />
            Eligible
          </Badge>
        );
      case "ineligible":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Not Eligible
          </Badge>
        );
      case "cooldown":
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
            <Clock className="h-3 w-3 mr-1" />
            Cooldown
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            Claim Tokens
          </span>
          {eligibilityStatus !== "idle" && getEligibilityBadge()}
        </CardTitle>
        <CardDescription>
          Claim FOGO tokens automatically calculated based on your wallet's transaction history
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {eligibilityData && (
          <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Transaction Count:</span>
                <div className="font-mono font-bold">{eligibilityData.txnCount}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Claim Amount:</span>
                <div className="font-mono font-bold text-primary">{eligibilityData.proposedAmount} FOGO</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Amount based on wallet transaction history
            </div>
          </div>
        )}

        {!isConnected && (
          <div className="p-3 bg-muted rounded-lg flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            Connect your wallet to check eligibility
          </div>
        )}

        {isConnected && eligibilityStatus === "idle" && (
          <Button 
            onClick={checkEligibility}
            disabled={isChecking}
            className="w-full"
            data-testid="button-check-eligibility"
          >
            {isChecking ? "Checking..." : "Check Eligibility"}
          </Button>
        )}

        {eligibilityStatus === "eligible" && (
          <Button 
            onClick={handleClaim}
            disabled={claimMutation.isPending}
            className="w-full"
            data-testid="button-claim-tokens"
          >
            {claimMutation.isPending ? "Claiming..." : `Claim ${eligibilityData?.proposedAmount || 0} FOGO`}
          </Button>
        )}

        {eligibilityStatus === "ineligible" && (
          <div className="space-y-2">
            <Button disabled className="w-full">
              Not Eligible
            </Button>
            <p className="text-xs text-red-600 dark:text-red-400">
              You are not eligible to claim tokens at this time.
            </p>
          </div>
        )}

        {eligibilityStatus === "cooldown" && (
          <div className="space-y-2">
            <Button disabled className="w-full">
              Cooldown Active
            </Button>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              Last claim: {lastClaimTime}. Please wait 24 hours between claims.
            </p>
          </div>
        )}

        {isConnected && (
          <Button 
            variant="outline" 
            onClick={checkEligibility}
            disabled={isChecking}
            className="w-full"
            data-testid="button-recheck-eligibility"
          >
            Recheck Eligibility
          </Button>
        )}
      </CardContent>
    </Card>
  );
}