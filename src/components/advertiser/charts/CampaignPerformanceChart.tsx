import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface CampaignPerformancePoint {
  date: string;
  impressions: number;
  clicks: number;
  saves: number;
  conversions: number;
}

interface CampaignPerformanceChartProps {
  data: CampaignPerformancePoint[];
}

const tooltipStyle = {
  backgroundColor: 'rgba(0,0,0,0.8)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
};

export const CampaignPerformanceChart = ({ data }: CampaignPerformanceChartProps) => (
  <ResponsiveContainer width="100%" height={300}>
    <LineChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
      <XAxis dataKey="date" stroke="#9ca3af" />
      <YAxis stroke="#9ca3af" />
      <Tooltip contentStyle={tooltipStyle} />
      <Legend />
      <Line type="monotone" dataKey="impressions" stroke="hsl(42, 92%, 56%)" name="Impressions" />
      <Line type="monotone" dataKey="clicks" stroke="#3b82f6" name="Clicks" />
    </LineChart>
  </ResponsiveContainer>
);
