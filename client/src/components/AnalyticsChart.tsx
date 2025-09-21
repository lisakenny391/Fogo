import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { TrendingUp, BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { faucetApi } from "@/lib/api";

interface AnalyticsChartProps {
  type?: "line" | "bar";
  title?: string;
  description?: string;
}

export function AnalyticsChart({ 
  type = "line",
  title = "Weekly Analytics",
  description = "Claims and user activity over the past week"
}: AnalyticsChartProps) {

  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/stats/chart'],
    queryFn: () => faucetApi.getChartData(),
    refetchInterval: 60000, // Refetch every minute
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg shadow-lg p-3">
          <p className="font-medium">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.dataKey === "claims" ? "Claims" : "Users"}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {type === "line" ? (
              <TrendingUp className="h-5 w-5 text-primary" />
            ) : (
              <BarChart3 className="h-5 w-5 text-primary" />
            )}
            {title}
          </CardTitle>
          <CardDescription>
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full flex items-center justify-center">
            <div className="animate-pulse space-y-4 w-full">
              <div className="h-4 bg-muted rounded w-1/4"></div>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-8 bg-muted rounded" style={{ width: `${60 + Math.random() * 40}%` }}></div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {type === "line" ? (
              <TrendingUp className="h-5 w-5 text-primary" />
            ) : (
              <BarChart3 className="h-5 w-5 text-primary" />
            )}
            {title}
          </CardTitle>
          <CardDescription>
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full flex items-center justify-center">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">
                Failed to load chart data. Please try refreshing.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // If no data yet, show empty state with sample data
  const chartData = data.length > 0 ? data : [
    { date: "Mon", claims: 0, users: 0 },
    { date: "Tue", claims: 0, users: 0 },
    { date: "Wed", claims: 0, users: 0 },
    { date: "Thu", claims: 0, users: 0 },
    { date: "Fri", claims: 0, users: 0 },
    { date: "Sat", claims: 0, users: 0 },
    { date: "Sun", claims: 0, users: 0 }
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {type === "line" ? (
            <TrendingUp className="h-5 w-5 text-primary" />
          ) : (
            <BarChart3 className="h-5 w-5 text-primary" />
          )}
          {title}
        </CardTitle>
        <CardDescription>
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full" data-testid="analytics-chart">
          <ResponsiveContainer width="100%" height="100%">
            {type === "line" ? (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  className="text-xs fill-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  className="text-xs fill-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line 
                  type="monotone" 
                  dataKey="claims" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, stroke: "hsl(var(--primary))", strokeWidth: 2 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="users" 
                  stroke="hsl(var(--chart-2))" 
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--chart-2))", strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, stroke: "hsl(var(--chart-2))", strokeWidth: 2 }}
                />
              </LineChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  className="text-xs fill-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  className="text-xs fill-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey="claims" 
                  fill="hsl(var(--primary))" 
                  radius={[2, 2, 0, 0]}
                />
                <Bar 
                  dataKey="users" 
                  fill="hsl(var(--chart-2))" 
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
        
        <div className="flex items-center justify-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-primary" />
            <span className="text-sm text-muted-foreground">Claims</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-chart-2" />
            <span className="text-sm text-muted-foreground">Users</span>
          </div>
        </div>
        
        {data.length === 0 && (
          <div className="text-center mt-4">
            <p className="text-xs text-muted-foreground">
              No activity data yet. Start using the faucet to see analytics.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}