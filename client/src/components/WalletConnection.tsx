import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, Copy, ExternalLink, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WalletConnectionProps {
  onConnect?: (address: string) => void;
  onDisconnect?: () => void;
}

interface SolanaWallet {
  name: string;
  icon: string;
  adapter: any;
  installed: boolean;
  readyState: string;
}

export function WalletConnection({ onConnect, onDisconnect }: WalletConnectionProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState("");
  const [connectedWalletName, setConnectedWalletName] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [availableWallets, setAvailableWallets] = useState<SolanaWallet[]>([]);
  const [showWalletSelection, setShowWalletSelection] = useState(false);
  const { toast } = useToast();

  // Detect available Solana wallets
  useEffect(() => {
    const detectWallets = () => {
      const wallets: SolanaWallet[] = [];

      // Phantom Wallet
      if ((window as any).solana?.isPhantom) {
        wallets.push({
          name: "Phantom",
          icon: "https://phantom.app/img/phantom-ico.png",
          adapter: (window as any).solana,
          installed: true,
          readyState: "Installed"
        });
      }

      // Solflare Wallet
      if ((window as any).solflare?.isSolflare) {
        wallets.push({
          name: "Solflare",
          icon: "https://solflare.com/img/logo.svg",
          adapter: (window as any).solflare,
          installed: true,
          readyState: "Installed"
        });
      }

      // Backpack Wallet
      if ((window as any).backpack?.isBackpack && (window as any).backpack?.solana) {
        wallets.push({
          name: "Backpack",
          icon: "https://backpack.app/logo.png",
          adapter: (window as any).backpack,
          installed: true,
          readyState: "Installed"
        });
      }

      // Slope Wallet - more robust detection
      if (typeof (window as any).Slope === 'function') {
        try {
          const slopeAdapter = new (window as any).Slope();
          wallets.push({
            name: "Slope",
            icon: "https://slope.finance/img/icon.svg",
            adapter: slopeAdapter,
            installed: true,
            readyState: "Installed"
          });
        } catch (error) {
          console.warn('Failed to initialize Slope wallet:', error);
        }
      }

      // Nightly Wallet
      if ((window as any).nightly?.solana) {
        wallets.push({
          name: "Nightly",
          icon: "https://nightly.app/img/logo.svg",
          adapter: (window as any).nightly.solana,
          installed: true,
          readyState: "Installed"
        });
      }

      // Add not installed wallets for user to know what's available
      const installedWalletNames = wallets.map(w => w.name);
      
      // Always show major wallet options for consistency
      const majorWallets = ["Phantom", "Solflare", "Backpack", "Slope", "Nightly"];
      
      for (const walletName of majorWallets) {
        if (!installedWalletNames.includes(walletName)) {
          let icon = "";
          switch (walletName) {
            case "Phantom":
              icon = "https://phantom.app/img/phantom-ico.png";
              break;
            case "Solflare":
              icon = "https://solflare.com/img/logo.svg";
              break;
            case "Backpack":
              icon = "https://backpack.app/logo.png";
              break;
            case "Slope":
              icon = "https://slope.finance/img/icon.svg";
              break;
            case "Nightly":
              icon = "https://nightly.app/img/logo.svg";
              break;
          }
          
          wallets.push({
            name: walletName,
            icon,
            adapter: null,
            installed: false,
            readyState: "NotDetected"
          });
        }
      }

      setAvailableWallets(wallets);
    };

    detectWallets();
  }, []);

  const connectWallet = async (wallet?: SolanaWallet) => {
    // If no wallet specified, show selection if multiple available
    if (!wallet) {
      const installedWallets = availableWallets.filter(w => w.installed);
      if (installedWallets.length > 1) {
        setShowWalletSelection(true);
        return;
      } else if (installedWallets.length === 1) {
        wallet = installedWallets[0];
      } else {
        toast({
          title: "No Wallet Found",
          description: "Please install a Solana wallet to continue",
          variant: "destructive",
        });
        return;
      }
    }

    if (!wallet.installed || !wallet.adapter) {
      toast({
        title: "Wallet Not Available",
        description: `${wallet.name} is not installed. Please install ${wallet.name} and refresh the page.`,
        variant: "destructive",
      });
      return;
    }

    setIsConnecting(true);
    
    try {
      let walletAddress: string;
      
      // Handle different wallet connection methods and response formats
      if (wallet.name === "Slope") {
        const response = await wallet.adapter.connect();
        walletAddress = response?.data?.publicKey || response?.data?.address;
        if (!walletAddress) {
          throw new Error("Failed to get public key from Slope wallet");
        }
      } else if (wallet.name === "Solflare") {
        await wallet.adapter.connect();
        // Solflare stores publicKey directly on the adapter after connection
        walletAddress = wallet.adapter.publicKey?.toString();
        if (!walletAddress) {
          throw new Error("Failed to get public key from Solflare wallet");
        }
      } else if (wallet.name === "Backpack") {
        // Backpack uses .solana.connect() method
        await wallet.adapter.solana?.connect();
        walletAddress = wallet.adapter.solana?.publicKey?.toString();
        if (!walletAddress) {
          throw new Error("Failed to get public key from Backpack wallet");
        }
      } else if (wallet.name === "Nightly") {
        // Nightly wallet connection
        const response = await wallet.adapter.connect();
        walletAddress = response?.publicKey?.toString() || wallet.adapter.publicKey?.toString();
        if (!walletAddress) {
          throw new Error("Failed to get public key from Nightly wallet");
        }
      } else {
        // Standard Solana wallet adapter (Phantom and others)
        await wallet.adapter.connect();
        // After connect, publicKey is available on the adapter
        walletAddress = wallet.adapter.publicKey?.toString();
        if (!walletAddress) {
          throw new Error("Failed to get public key from wallet");
        }
      }
      
      setAddress(walletAddress);
      setIsConnected(true);
      setConnectedWalletName(wallet.name);
      setShowWalletSelection(false);
      onConnect?.(walletAddress);
      
      toast({
        title: "Wallet Connected",
        description: `Successfully connected to ${wallet.name}`,
      });
    } catch (error: any) {
      console.error('Wallet connection error:', error);
      let errorMessage = "Failed to connect wallet. Please try again.";
      
      if (error.code === 4001) {
        errorMessage = "Connection rejected. Please accept the connection request in your wallet.";
      } else if (error.code === -32002) {
        errorMessage = "Connection request is already pending. Please check your wallet.";
      } else if (error.message?.includes('User rejected')) {
        errorMessage = "Connection rejected. Please accept the connection request to continue.";
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
    setConnectedWalletName("");
    setShowWalletSelection(false);
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
    // Show wallet selection if user clicked connect and multiple wallets available
    if (showWalletSelection) {
      return (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2">
              <Wallet className="h-5 w-5" />
              Select Wallet
            </CardTitle>
            <CardDescription className="text-center">
              Choose your preferred wallet to connect
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {availableWallets.map((wallet) => (
              <Button
                key={wallet.name}
                variant={wallet.installed ? "outline" : "ghost"}
                className={`w-full justify-start gap-3 p-4 h-auto ${
                  !wallet.installed ? "opacity-50 cursor-not-allowed" : ""
                }`}
                onClick={() => wallet.installed ? connectWallet(wallet) : null}
                disabled={isConnecting || !wallet.installed}
                data-testid={`button-connect-${wallet.name.toLowerCase()}`}
              >
                <img 
                  src={wallet.icon} 
                  alt={wallet.name} 
                  className="h-8 w-8 rounded"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCA5TDEzLjA5IDE1Ljc0TDEyIDIyTDEwLjkxIDE1Ljc0TDQgOUwxMC45MSA4LjI2TDEyIDJaIiBmaWxsPSJjdXJyZW50Q29sb3IiLz4KPC9zdmc+';
                  }}
                />
                <div className="flex-1 text-left">
                  <div className="font-medium">{wallet.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {wallet.installed ? "Installed" : "Not installed"}
                  </div>
                </div>
              </Button>
            ))}
            <Button
              variant="ghost"
              onClick={() => setShowWalletSelection(false)}
              className="w-full"
              data-testid="button-back-to-connect"
            >
              Back
            </Button>
          </CardContent>
        </Card>
      );
    }

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
            onClick={() => connectWallet()}
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
            Connected {connectedWalletName && `to ${connectedWalletName}`}
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
              onClick={() => window.open(`https://explorer.solana.com/address/${address}?cluster=testnet`, '_blank')}
              data-testid="button-view-explorer"
              className="h-8 w-8"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="text-center text-sm text-muted-foreground">
          Network: Solana
        </div>
      </CardContent>
    </Card>
  );
}