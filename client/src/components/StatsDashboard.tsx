import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, Coins } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { faucetApi } from "@/lib/api";

interface StatsDashboardProps {
  // Props are optional since we'll fetch data from API
}

export function StatsDashboard(props: StatsDashboardProps) {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['/api/stats'],
    queryFn: () => faucetApi.getStats(),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                <div className="h-4 bg-muted rounded w-20 animate-pulse"></div>
              </CardTitle>
              <div className="h-4 w-4 bg-muted rounded animate-pulse"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-24 animate-pulse mb-2"></div>
              <div className="h-3 bg-muted rounded w-32 animate-pulse"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="col-span-full">
          <CardContent className="pt-6">
            <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-400">
                Failed to load statistics. Please try refreshing the page.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    } else {
      return num.toString();
    }
  };

  const formatTokenAmount = (amount: string, tokenType: "FOGO" | "BONUS" = "FOGO") => {
    const num = parseFloat(amount);
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M ${tokenType}`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K ${tokenType}`;
    } else {
      return `${num.toFixed(tokenType === "FOGO" ? 2 : 0)} ${tokenType}`;
    }
  };

  const statItems = [
    {
      title: "Total Claims",
      value: formatNumber(stats.totalClaims),
      description: "Successful token claims",
      changeText: "+12.5%",
      icon: Coins
    },
    {
      title: "Active Users", 
      value: formatNumber(stats.totalUsers),
      description: "Unique wallet addresses",
      changeText: "+8.2%",
      icon: Users
    },
    {
      title: "FOGO Distributed",
      value: formatTokenAmount(stats.totalDistributed, "FOGO"),
      description: "Total FOGO distributed", 
      changeText: "",
      icon: TrendingUp
    },
    {
      title: "Bonus Claims",
      value: formatNumber(stats.totalBonusClaims),
      description: "Successful bonus claims",
      changeText: `Rate: 1:${stats.bonusConversionRate}`,
      icon: Coins
    },
    {
      title: "Bonus Distributed",
      value: formatTokenAmount(stats.totalBonusDistributed, "BONUS"),
      description: "Total bonus tokens distributed",
      changeText: "",
      icon: TrendingUp
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {statItems.map((item, index) => (
        <Card key={index} className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {item.title}
            </CardTitle>
            <item.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono" data-testid={`stat-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
              {item.value}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {item.description}
            </p>
            {item.changeText && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                {item.changeText}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}