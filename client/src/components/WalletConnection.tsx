import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, Copy, ExternalLink, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ethers } from "ethers";

interface WalletConnectionProps {
  onConnect?: (address: string) => void;
  onDisconnect?: () => void;
}

export function WalletConnection({ onConnect, onDisconnect }: WalletConnectionProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const connectWallet = async () => {
    setIsConnecting(true);
    
    try {
      // Check if MetaMask is installed
      if (typeof (window as any).ethereum === 'undefined') {
        throw new Error('MetaMask is not installed. Please install MetaMask to continue.');
      }

      // Request account access
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      await provider.send("eth_requestAccounts", []);
      
      // Get the signer (connected account)
      const signer = await provider.getSigner();
      const walletAddress = await signer.getAddress();
      
      setAddress(walletAddress);
      setIsConnected(true);
      onConnect?.(walletAddress);
      
      toast({
        title: "Wallet Connected",
        description: "Successfully connected to your wallet",
      });
    } catch (error: any) {
      console.error('Wallet connection error:', error);
      let errorMessage = "Failed to connect wallet. Please try again.";
      
      if (error.message?.includes('MetaMask is not installed')) {
        errorMessage = "MetaMask is not installed. Please install MetaMask browser extension to continue.";
      } else if (error.code === 4001) {
        errorMessage = "Connection rejected. Please accept the connection request in your wallet.";
      } else if (error.code === -32002) {
        errorMessage = "Connection request is already pending. Please check your wallet.";
      }
      
      toast({
        title: "Connection Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setIsConnected(false);
    setAddress("");
    onDisconnect?.();
    
    toast({
      title: "Wallet Disconnected",
      description: "Your wallet has been disconnected",
    });
  };

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    
    toast({
      title: "Address Copied",
      description: "Wallet address copied to clipboard",
    });
  };

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (!isConnected) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <Wallet className="h-5 w-5" />
            Connect Wallet
          </CardTitle>
          <CardDescription>
            Connect your wallet to start claiming STT tokens
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={connectWallet}
            disabled={isConnecting}
            className="w-full"
            data-testid="button-connect-wallet"
          >
            {isConnecting ? "Connecting..." : "Connect Wallet"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <div className="h-2 w-2 bg-green-500 rounded-full" />
            Connected
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={disconnectWallet}
            data-testid="button-disconnect-wallet"
          >
            Disconnect
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <span className="font-mono text-sm" data-testid="text-wallet-address">
            {truncateAddress(address)}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={copyAddress}
              data-testid="button-copy-address"
              className="h-8 w-8"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-view-explorer"
              className="h-8 w-8"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="text-center text-sm text-muted-foreground">
          Network: FOGO Network
        </div>
      </CardContent>
    </Card>
  );
}