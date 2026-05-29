import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { CampaignPerformancePoint } from './CampaignPerformanceChart';

interface CampaignEngagementChartProps {
  data: CampaignPerformancePoint[];
}

const tooltipStyle = {
  backgroundColor: 'rgba(0,0,0,0.8)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
};

export const CampaignEngagementChart = ({ data }: CampaignEngagementChartProps) => (
  <ResponsiveContainer width="100%" height={300}>
    <BarChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
      <XAxis dataKey="date" stroke="#9ca3af" />
      <YAxis stroke="#9ca3af" />
      <Tooltip contentStyle={tooltipStyle} />
      <Legend />
      <Bar dataKey="saves" fill="hsl(42, 92%, 56%)" name="Saves" />
      <Bar dataKey="conversions" fill="#10b981" name="Conversions" />
    </BarChart>
  </ResponsiveContainer>
);
