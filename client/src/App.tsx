import { Router, Route } from "wouter";
import { ThemeProvider } from "./components/ThemeProvider";
import { Navigation } from "./components/Navigation";
import { ClaimInterface } from "./components/ClaimInterface";
import { FaucetStatus } from "./components/FaucetStatus";
import { StatsDashboard } from "./components/StatsDashboard";
import { RecentActivity } from "./components/RecentActivity";
import { Leaderboard } from "./components/Leaderboard";
import { AnalyticsChart } from "./components/AnalyticsChart";
import NotFound from "./pages/not-found";

function HomePage() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <ClaimInterface />
        <FaucetStatus />
      </div>
      
      <StatsDashboard />
      
      <div className="grid gap-6 md:grid-cols-2">
        <RecentActivity />
        <Leaderboard />
      </div>
    </div>
  );
}

function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>
      <AnalyticsChart />
      <div className="grid gap-6 md:grid-cols-2">
        <RecentActivity />
        <Leaderboard />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="faucet-ui-theme">
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <Router>
            <Route path="/" component={HomePage} />
            <Route path="/analytics" component={AnalyticsPage} />
            <Route component={NotFound} />
          </Router>
        </main>
      </div>
    </ThemeProvider>
  );
}