'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { motion } from 'framer-motion';
import { Activity, BarChart2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import GlassCard from './GlassCard';

interface OfferRecord {
  id: string;
  name: string;
  vertical: string;
  payout: number;
  epc: number;
  score_total: number;
  tier: string;
  confidence_score: number;
  expected_profit_per_click: number;
  breakeven_cpc: number;
  avg_cpc_used: number;
}

interface ScorePoint {
  name: string;
  score_total: number;
}

interface TierPoint {
  tier: string;
  count: number;
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

const TIER_COLORS: Record<string, string> = {
  A: '#3b82f6',
  B: 'rgba(59,130,246,0.5)',
  C: 'rgba(59,130,246,0.2)',
};

function buildScoreData(offers: OfferRecord[]): ScorePoint[] {
  return [...offers]
    .sort((a, b) => b.score_total - a.score_total)
    .slice(0, 10)
    .map((o) => ({ name: o.name.slice(0, 12), score_total: o.score_total }));
}

function buildTierData(offers: OfferRecord[]): TierPoint[] {
  const counts: Record<string, number> = {};
  for (const o of offers) {
    counts[o.tier] = (counts[o.tier] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tier, count]) => ({ tier, count }));
}

async function fetchOffers(): Promise<{ offers: OfferRecord[]; fetchedAt: string }> {
  const res = await fetch('/api/nexus/scores?limit=50');
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to load chart data');
  return {
    offers: json.data as OfferRecord[],
    fetchedAt: new Date().toISOString(),
  };
}

export default function CampaignVisualizer({ className }: { className?: string }) {
  const [scoreData, setScoreData] = useState<ScorePoint[]>([]);
  const [tierData, setTierData] = useState<TierPoint[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { offers, fetchedAt } = await fetchOffers();
      setScoreData(buildScoreData(offers));
      setTierData(buildTierData(offers));
      setLastUpdated(fetchedAt);
      setChartError(null);
    } catch (err: unknown) {
      setChartError((err as Error).message || 'Chart data unavailable');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return (
    <GlassCard className={cn('grid grid-cols-1 lg:grid-cols-2 gap-8', className)}>
      {chartError ? (
        <div className="col-span-full flex items-center justify-center gap-3 py-16 text-red-400">
          <AlertTriangle size={20} />
          <span className="text-sm font-medium">{chartError}</span>
        </div>
      ) : (<>
      <div className="flex flex-col h-[300px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold tracking-widest text-[#9ca3af] uppercase flex items-center gap-2">
            <Activity size={16} className="text-blue-500" />
            Nexus Score Distribution
          </h3>
          {lastUpdated && (
            <motion.div
              key={lastUpdated}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[10px] font-mono text-gray-500"
            >
              Updated {timeAgo(lastUpdated)}
            </motion.div>
          )}
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={scoreData}>
            <defs>
              <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#4b5563', fontSize: 10, fontWeight: 600 }}
              dy={10}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{ backgroundColor: '#0a0c10', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
              itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
            />
            <Area
              type="monotone"
              dataKey="score_total"
              stroke="#3b82f6"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorScore)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-col h-[300px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold tracking-widest text-[#9ca3af] uppercase flex items-center gap-2">
            <BarChart2 size={16} className="text-emerald-500" />
            Tier Distribution
          </h3>
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={tierData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="tier"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#4b5563', fontSize: 10, fontWeight: 600 }}
              dy={10}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{ backgroundColor: '#0a0c10', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
              itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
            />
            <Bar
              dataKey="count"
              radius={[4, 4, 0, 0]}
              shape={(props: { x?: number; y?: number; width?: number; height?: number; payload?: TierPoint }) => {
                const { x = 0, y = 0, width = 0, height = 0, payload } = props;
                const fill = TIER_COLORS[payload?.tier ?? ''] ?? 'rgba(59,130,246,0.2)';
                return <rect x={x} y={y} width={width} height={height} fill={fill} rx={4} ry={4} />;
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      </>
      )}
    </GlassCard>
  );
}
