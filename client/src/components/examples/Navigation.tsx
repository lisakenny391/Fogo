import { Navigation } from '../Navigation';

export default function NavigationExample() {
  const handleWalletConnect = (address: string) => {
    console.log('Wallet connected:', address);
  };

  const handleWalletDisconnect = () => {
    console.log('Wallet disconnected');
  };

  return (
    <div>
      <Navigation 
        walletAddress="0x742d35Cc6e34C0532925a3b8D0f5757d112e4b01"
        isWalletConnected={true}
        onWalletConnect={handleWalletConnect}
        onWalletDisconnect={handleWalletDisconnect}
      />
      <div className="p-8">
        <h1 className="text-2xl font-bold">Navigation Example</h1>
        <p className="text-muted-foreground">
          This shows the navigation component with wallet connected.
        </p>
      </div>
    </div>
  );
}