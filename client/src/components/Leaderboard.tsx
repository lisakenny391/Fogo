import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface LeaderboardEntry {
  rank: number;
  address: string;
  claims: number;
  totalAmount: string;
  lastClaim: string;
}

interface LeaderboardProps {
  entries?: LeaderboardEntry[];
}

export function Leaderboard({ 
  entries = [
    {
      rank: 1,
      address: "0x742d35Cc6e34C0532925a3b8D0f5757d112e4b01",
      claims: 127,
      totalAmount: "12,700 STT",
      lastClaim: "2 hours ago"
    },
    {
      rank: 2,
      address: "0x8Ba1f109551bD432803012645Hac136c92F89e976", 
      claims: 89,
      totalAmount: "8,900 STT",
      lastClaim: "5 hours ago"
    },
    {
      rank: 3,
      address: "0x9Cd2f108440aC431702901634Hac157c82F79e887",
      claims: 76,
      totalAmount: "7,600 STT", 
      lastClaim: "1 day ago"
    },
    {
      rank: 4,
      address: "0x4Ef3g207330bD320601890523Hac168d71F69d776",
      claims: 65,
      totalAmount: "6,500 STT",
      lastClaim: "3 hours ago"
    },
    {
      rank: 5,
      address: "0x2Bc1e096220eC210490789412Hac179e60F58c665",
      claims: 54,
      totalAmount: "5,400 STT",
      lastClaim: "6 hours ago"
    },
    {
      rank: 6,
      address: "0x1Ad4f085110dB209380678401Hac190f50F47d554",
      claims: 43,
      totalAmount: "4,300 STT", 
      lastClaim: "1 day ago"
    },
    {
      rank: 7,
      address: "0x7Ce5h096440eD431802910634Hac201g93F68f998",
      claims: 38,
      totalAmount: "3,800 STT",
      lastClaim: "8 hours ago"
    },
    {
      rank: 8,
      address: "0x6Df4i207550fE542903021745Hac212h04F57g887",
      claims: 32,
      totalAmount: "3,200 STT",
      lastClaim: "12 hours ago"
    }
  ]
}: LeaderboardProps) {
  const { toast } = useToast();

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
    toast({
      title: "Address Copied",
      description: "Wallet address copied to clipboard",
    });
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 2:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 3:
        return <Award className="h-5 w-5 text-amber-600" />;
      default:
        return <span className="text-lg font-bold text-muted-foreground">#{rank}</span>;
    }
  };

  const getRankBadge = (rank: number) => {
    if (rank <= 3) {
      const colors = {
        1: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400",
        2: "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400", 
        3: "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400"
      };
      return (
        <Badge variant="secondary" className={colors[rank as keyof typeof colors]}>
          #{rank}
        </Badge>
      );
    }
    return <Badge variant="outline">#{rank}</Badge>;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          Leaderboard
        </CardTitle>
        <CardDescription>
          Top users by total claims and amount
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {entries.map((entry) => (
            <div 
              key={entry.rank} 
              className={`flex items-center justify-between p-3 rounded-lg border hover-elevate ${
                entry.rank <= 3 ? 'bg-muted/50' : 'bg-muted/30'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8">
                  {getRankIcon(entry.rank)}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm" data-testid={`leaderboard-address-${entry.rank}`}>
                      {truncateAddress(entry.address)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyAddress(entry.address)}
                      data-testid={`copy-leaderboard-address-${entry.rank}`}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Last claim: {entry.lastClaim}
                  </div>
                </div>
              </div>
              
              <div className="text-right space-y-1">
                <div className="flex items-center gap-2">
                  {getRankBadge(entry.rank)}
                </div>
                <div className="font-semibold font-mono text-sm" data-testid={`leaderboard-amount-${entry.rank}`}>
                  {entry.totalAmount}
                </div>
                <div className="text-xs text-muted-foreground" data-testid={`leaderboard-claims-${entry.rank}`}>
                  {entry.claims} claims
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}