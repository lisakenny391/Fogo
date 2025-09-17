import { useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "./components/ThemeProvider";
import { Navigation } from "./components/Navigation";
import { AddressInput } from "./components/AddressInput";
import { ClaimInterface } from "./components/ClaimInterface";
import { StatsDashboard } from "./components/StatsDashboard";
import { RecentActivity } from "./components/RecentActivity";
import { Leaderboard } from "./components/Leaderboard";
import { AnalyticsChart } from "./components/AnalyticsChart";

// Main Faucet Page
function FaucetPage({ 
  walletAddress, 
  onAddressSubmit,
  onClaim 
}: any) {
  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">FOGO Token Faucet</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Get free FOGO testnet tokens automatically calculated based on your wallet's transaction history. 
          Fast, secure, and reliable token distribution.
        </p>
      </div>

      {/* Main Interface */}
      <div className="flex justify-center">
        <div className="w-full max-w-md">
          {!walletAddress ? (
            <AddressInput 
              onAddressSubmit={onAddressSubmit}
              currentAddress={walletAddress}
            />
          ) : (
            <div className="space-y-4">
              <AddressInput 
                onAddressSubmit={onAddressSubmit}
                currentAddress={walletAddress}
              />
              <ClaimInterface 
                walletAddress={walletAddress}
                isConnected={true}
                onClaim={onClaim}
              />
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

// Analytics Page
function AnalyticsPage() {
  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
        <p className="text-muted-foreground">
          Comprehensive analytics and insights for the FOGO faucet
        </p>
      </div>

      <StatsDashboard />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnalyticsChart 
          type="line"
          title="Weekly Claims Trend"
          description="Token claims over the past week"
        />
        <AnalyticsChart 
          type="bar"
          title="Daily User Activity"
          description="Active users per day"
        />
      </div>

      <AnalyticsChart 
        type="line"
        title="Monthly Overview"
        description="Comprehensive monthly statistics"
      />
    </div>
  );
}

// Leaderboard Page
function LeaderboardPage() {
  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">User Leaderboard</h1>
        <p className="text-muted-foreground">
          Top users by total claims and token amounts
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Leaderboard />
        </div>
        <div className="space-y-6">
          <StatsDashboard />
        </div>
      </div>
    </div>
  );
}

// Activity Page
function ActivityPage() {
  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Recent Activity</h1>
        <p className="text-muted-foreground">
          Real-time feed of all faucet transactions and claims
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentActivity />
        <div className="space-y-6">
          <AnalyticsChart 
            type="bar"
            title="Hourly Activity"
            description="Claims activity by hour"
          />
        </div>
      </div>
    </div>
  );
}

// Router Component
function Router({ walletAddress, onAddressSubmit, onClaim }: any) {
  return (
    <Switch>
      <Route path="/">
        <FaucetPage 
          walletAddress={walletAddress}
          onAddressSubmit={onAddressSubmit}
          onClaim={onClaim}
        />
      </Route>
      <Route path="/analytics">
        <AnalyticsPage />
      </Route>
      <Route path="/leaderboard">
        <LeaderboardPage />
      </Route>
      <Route path="/activity">
        <ActivityPage />
      </Route>
      <Route>
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
          <p className="text-muted-foreground">The page you're looking for doesn't exist.</p>
        </div>
      </Route>
    </Switch>
  );
}

// Main App Component
function App() {
  const [walletAddress, setWalletAddress] = useState<string>("");

  const handleAddressSubmit = (address: string) => {
    setWalletAddress(address);
    console.log('Address submitted:', address);
  };

  const handleClaim = (amount: string) => {
    console.log('Tokens claimed:', amount);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <div className="min-h-screen bg-background">
            <Navigation 
              walletAddress={walletAddress}
              isWalletConnected={!!walletAddress}
              onWalletConnect={handleAddressSubmit}
              onWalletDisconnect={() => setWalletAddress("")}
            />
            <Router 
              walletAddress={walletAddress}
              onAddressSubmit={handleAddressSubmit}
              onClaim={handleClaim}
            />
          </div>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;