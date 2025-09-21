import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { faucetApi } from "@/lib/api";

interface LeaderboardProps {
  limit?: number;
}

export function Leaderboard({ limit = 1000 }: LeaderboardProps) {
  const { toast } = useToast();
  
  const { data: entries, isLoading, error } = useQuery({
    queryKey: ['/api/leaderboard', limit],
    queryFn: () => faucetApi.getLeaderboard(limit),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

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

  if (isLoading) {
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
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 animate-pulse">
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-8 h-8 bg-muted rounded"></div>
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-muted rounded w-32"></div>
                    <div className="h-3 bg-muted rounded w-24"></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-16"></div>
                  <div className="h-4 bg-muted rounded w-20"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-400">
              Failed to load leaderboard. Please try refreshing the page.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!entries || entries.length === 0) {
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
          <div className="text-center py-8">
            <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              No claims yet. Be the first to claim tokens and top the leaderboard!
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

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
                      {truncateAddress(entry.walletAddress)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyAddress(entry.walletAddress)}
                      data-testid={`copy-leaderboard-address-${entry.rank}`}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Last claim: {entry.lastClaimAgo}
                  </div>
                </div>
              </div>
              
              <div className="text-right space-y-1">
                <div className="flex items-center gap-2">
                  {getRankBadge(entry.rank)}
                </div>
                <div className="font-semibold font-mono text-sm" data-testid={`leaderboard-amount-${entry.rank}`}>
                  {entry.totalAmount} FOGO
                </div>
                <div className="text-xs text-muted-foreground" data-testid={`leaderboard-claims-${entry.rank}`}>
                  {entry.claims} claims
                </div>
                {entry.bonusClaims > 0 && (
                  <div className="text-xs text-orange-600 dark:text-orange-400" data-testid={`leaderboard-bonus-${entry.rank}`}>
                    +{parseFloat(entry.totalBonusAmount || '0').toLocaleString()} bonus ({entry.bonusClaims} claims)
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}