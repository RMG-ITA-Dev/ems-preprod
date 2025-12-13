import { ResponsiveContainer, LineChart, Line, YAxis } from 'recharts';
import { cn } from '@/lib/utils';

export interface SparklineDataPoint {
  value: number;
}

interface SparklineProps {
  data: SparklineDataPoint[];
  color?: 'primary' | 'success' | 'warning' | 'destructive' | 'muted';
  height?: number;
  className?: string;
}

const colorMap = {
  primary: 'hsl(var(--primary))',
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  destructive: 'hsl(var(--destructive))',
  muted: 'hsl(var(--muted-foreground))',
};

export function Sparkline({ 
  data, 
  color = 'primary', 
  height = 32,
  className 
}: SparklineProps) {
  if (!data || data.length < 2) {
    return null;
  }

  const strokeColor = colorMap[color];
  const minValue = Math.min(...data.map(d => d.value));
  const maxValue = Math.max(...data.map(d => d.value));
  const hasVariance = maxValue > minValue;

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <YAxis 
            domain={hasVariance ? ['dataMin', 'dataMax'] : [0, 'dataMax']} 
            hide 
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
