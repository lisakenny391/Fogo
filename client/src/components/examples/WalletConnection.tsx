import { WalletConnection } from '../WalletConnection';

export default function WalletConnectionExample() {
  const handleConnect = (address: string) => {
    console.log('Wallet connected:', address);
  };

  const handleDisconnect = () => {
    console.log('Wallet disconnected');
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <WalletConnection 
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />
    </div>
  );
}