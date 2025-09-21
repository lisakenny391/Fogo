import { ClaimInterface } from '../ClaimInterface';

export default function ClaimInterfaceExample() {
  const handleClaim = (amount: string) => {
    console.log('Claiming tokens:', amount);
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <ClaimInterface 
        walletAddress="0x742d35Cc6e34C0532925a3b8D0f5757d112e4b01"
        isConnected={true}
        onClaim={handleClaim}
      />
    </div>
  );
}