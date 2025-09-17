import { FaucetStatus } from '../FaucetStatus';

export default function FaucetStatusExample() {
  return (
    <div className="p-4">
      <FaucetStatus 
        balance="50,000 STT"
        status="online"
        dailyLimit="100 STT"
        nextRefill="12:34:56"
      />
    </div>
  );
}