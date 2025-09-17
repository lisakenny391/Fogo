import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, Check, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AddressInputProps {
  onAddressSubmit: (address: string) => void;
  currentAddress?: string;
}

export function AddressInput({ onAddressSubmit, currentAddress }: AddressInputProps) {
  const [address, setAddress] = useState(currentAddress || "");
  const [isValidating, setIsValidating] = useState(false);
  const { toast } = useToast();

  const validateSolanaAddress = (addr: string): boolean => {
    // Solana address validation: base58 encoded, 32-44 characters
    const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return solanaAddressRegex.test(addr);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!address.trim()) {
      toast({
        title: "Address Required",
        description: "Please enter a wallet address",
        variant: "destructive",
      });
      return;
    }

    if (!validateSolanaAddress(address.trim())) {
      toast({
        title: "Invalid Address",
        description: "Please enter a valid Solana wallet address",
        variant: "destructive",
      });
      return;
    }

    setIsValidating(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500)); // Brief delay for UX
      onAddressSubmit(address.trim());
      
      toast({
        title: "Address Validated",
        description: "Checking eligibility for token claim",
      });
    } catch (error) {
      toast({
        title: "Validation Failed",
        description: "Failed to validate address. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleClear = () => {
    setAddress("");
    onAddressSubmit("");
  };

  if (currentAddress) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <div className="h-2 w-2 bg-green-500 rounded-full" />
              Address Verified
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              data-testid="button-clear-address"
            >
              Change
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="font-mono text-sm" data-testid="text-current-address">
              {`${currentAddress.slice(0, 6)}...${currentAddress.slice(-4)}`}
            </span>
            <Check className="h-4 w-4 text-green-500" />
          </div>
          
          <div className="text-center text-sm text-muted-foreground">
            Network: Fogo Testnet (SVM)
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2">
          <Wallet className="h-5 w-5" />
          Enter Wallet Address
        </CardTitle>
        <CardDescription>
          Paste your Fogo/Solana wallet address to check eligibility and claim FOGO tokens
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wallet-address">Wallet Address</Label>
            <Input
              id="wallet-address"
              type="text"
              placeholder="e.g., 2iqtDHk1ofCHhcE56sUX3mbbtBQfYWXtKP6NsDQ4sCxg"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="font-mono text-sm"
              data-testid="input-wallet-address"
            />
          </div>
          
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              Enter a valid Solana-compatible wallet address. The system will check your transaction history to determine your token allocation.
            </div>
          </div>

          <Button 
            type="submit"
            disabled={isValidating || !address.trim()}
            className="w-full"
            data-testid="button-validate-address"
          >
            {isValidating ? "Validating..." : "Check Eligibility"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}