import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { Droplets, Menu, X, BarChart3, Users, Activity } from "lucide-react";
import { useLocation } from "wouter";

interface NavigationProps {
  walletAddress?: string;
  isWalletConnected?: boolean;
  onWalletConnect?: (address: string) => void;
  onWalletDisconnect?: () => void;
}

export function Navigation({
  walletAddress,
  isWalletConnected = false,
  onWalletConnect,
  onWalletDisconnect
}: NavigationProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [location, setLocation] = useLocation();

  const navItems = [
    { path: "/", label: "Faucet", icon: Droplets },
    { path: "/analytics", label: "Analytics", icon: BarChart3 },
    { path: "/leaderboard", label: "Leaderboard", icon: Users },
    { path: "/activity", label: "Activity", icon: Activity },
  ];

  const handleNavigation = (path: string) => {
    setLocation(path);
    setIsMobileMenuOpen(false);
  };

  const isActivePath = (path: string) => {
    return location === path || (path === "/" && location === "");
  };

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Droplets className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">FOGO Faucet</span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Button
                key={item.path}
                variant={isActivePath(item.path) ? "secondary" : "ghost"}
                onClick={() => handleNavigation(item.path)}
                className="flex items-center gap-2"
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Button>
            ))}
          </div>

          {/* Desktop Controls */}
          <div className="hidden md:flex items-center gap-2">
            <ThemeToggle />
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              data-testid="button-mobile-menu"
            >
              {isMobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t bg-background">
            <div className="py-4 space-y-2">
              {navItems.map((item) => (
                <Button
                  key={item.path}
                  variant={isActivePath(item.path) ? "secondary" : "ghost"}
                  onClick={() => handleNavigation(item.path)}
                  className="w-full justify-start gap-2"
                  data-testid={`mobile-nav-${item.label.toLowerCase()}`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}