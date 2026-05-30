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

export interface SeoTrendPoint {
  date: string;
  clicks: number;
  impressions: number;
}

interface SeoTrendChartProps {
  data: SeoTrendPoint[];
}

export const SeoTrendChart = ({ data }: SeoTrendChartProps) => (
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
      <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} />
      <YAxis
        yAxisId="right"
        orientation="right"
        stroke="hsl(var(--muted-foreground))"
        fontSize={12}
      />
      <Tooltip
        contentStyle={{
          background: 'hsl(var(--popover))',
          border: '1px solid hsl(var(--border))',
        }}
      />
      <Legend />
      <Line
        yAxisId="left"
        type="monotone"
        dataKey="clicks"
        stroke="hsl(var(--primary))"
        strokeWidth={2}
        dot={false}
      />
      <Line
        yAxisId="right"
        type="monotone"
        dataKey="impressions"
        stroke="hsl(var(--muted-foreground))"
        strokeWidth={2}
        dot={false}
      />
    </LineChart>
  </ResponsiveContainer>
);
