import { AnalyticsChart } from '../AnalyticsChart';

export default function AnalyticsChartExample() {
  return (
    <div className="p-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AnalyticsChart 
          type="line"
          title="Weekly Claims"
          description="Token claims over the past week"
        />
        <AnalyticsChart 
          type="bar"
          title="User Activity"
          description="Daily active users"
        />
      </div>
    </div>
  );
}