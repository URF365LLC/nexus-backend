'use client';

import React, { useEffect, useState } from 'react';
import { Sparkles, ArrowLeft, Clock, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import GlassCard from '@/components/GlassCard';
import OfferBriefDrawer from '@/components/OfferBriefDrawer';
import { cn } from '@/lib/utils';

interface Report {
  id: string;
  offer_id: string;
  offer_name: string;
  vertical: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  tier: string;
  score_total: number;
  confidence_score: number;
  generated_at: string | null;
  generation_time_ms: number | null;
  version: number;
}

const statusStyle: Record<string, string> = {
  completed:  'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  generating: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  pending:    'bg-white/5 border-white/10 text-gray-400',
  failed:     'bg-red-500/10 border-red-500/20 text-red-400',
};

const tierStyle: Record<string, string> = {
  A: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  B: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  C: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [briefOffer, setBriefOffer] = useState<{ id: string; name: string; vertical: string; tier: string } | null>(null);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const res = await fetch('/api/nexus/reports?limit=200'); // max supported by API — TODO: add cursor pagination
        const json = await res.json();
        if (json.success) {
          setReports(json.data);
        } else {
          setError(json.error || 'Failed to load reports');
        }
      } catch {
        setError('Connection aborted');
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, []);

  const completed  = reports.filter(r => r.status === 'completed');
  const generating = reports.filter(r => r.status === 'generating');
  const pending    = reports.filter(r => r.status === 'pending');
  const failed     = reports.filter(r => r.status === 'failed');

  return (
    <div className="p-10 max-w-[1600px] mx-auto ml-[var(--sidebar-w)] min-h-screen pb-20">
      <header className="mb-10">
        <Link
          href="/"
          className="flex items-center gap-2 text-primary hover:text-white transition-colors mb-4 group h-fit w-fit"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-xs font-bold uppercase tracking-widest">Operator HUD</span>
        </Link>
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tighter text-white uppercase italic flex items-center gap-3">
              <Sparkles size={28} className="text-primary" />
              Intelligence Synthesis
            </h1>
            <p className="text-gray-500 font-medium mt-1">
              AI-generated campaign briefs — Perplexity research + Claude analysis.
            </p>
          </div>
          <div className="flex items-center gap-8 text-right">
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-gray-600 mb-1">Ready</div>
              <div className="text-2xl font-bold text-emerald-400 tabular-nums">{completed.length}</div>
            </div>
            <div className="h-10 w-px bg-white/5" />
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-gray-600 mb-1">Generating</div>
              <div className="text-2xl font-bold text-amber-400 tabular-nums">{generating.length}</div>
            </div>
            <div className="h-10 w-px bg-white/5" />
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-gray-600 mb-1">Failed</div>
              <div className={cn("text-2xl font-bold tabular-nums", failed.length > 0 ? "text-red-400" : "text-gray-600")}>{failed.length}</div>
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <GlassCard className="flex flex-col items-center justify-center py-20 text-center border-red-500/20 bg-red-500/5">
          <AlertTriangle size={32} className="text-red-500 mb-4" />
          <h3 className="text-xl font-bold text-red-500 mb-2">Feed Offline</h3>
          <p className="text-red-400/80 text-sm">{error}</p>
        </GlassCard>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={20} className="text-primary animate-spin mr-3" />
          <span className="text-gray-500 text-xs font-bold uppercase tracking-widest">Loading synthesis feed...</span>
        </div>
      ) : (
        <GlassCard noPadding className="border-white/5">
          <div className="divide-y divide-white/5">
            <AnimatePresence>
              {reports.map((report, i) => (
                <motion.div
                  key={report.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.04, 0.5) }}
                  onClick={() => report.status === 'completed'
                    ? setBriefOffer({ id: report.offer_id, name: report.offer_name, vertical: report.vertical, tier: report.tier })
                    : undefined
                  }
                  className={cn(
                    "flex items-center gap-5 px-6 py-4 transition-colors",
                    report.status === 'completed' ? "hover:bg-white/[0.02] cursor-pointer group" : "opacity-60"
                  )}
                >
                  {/* Rank */}
                  <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-bold text-gray-600 tabular-nums shrink-0">
                    {i + 1}
                  </div>

                  {/* Name + vertical */}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm group-hover:text-primary transition-colors truncate">
                      {report.offer_name}
                    </div>
                    <div className="text-[10px] text-gray-600 font-medium uppercase tracking-tighter mt-0.5">
                      {report.vertical} · v{report.version}
                    </div>
                  </div>

                  {/* Tier badge */}
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border shrink-0",
                    tierStyle[report.tier] ?? 'bg-white/5 border-white/10 text-gray-400'
                  )}>
                    {report.tier}
                  </span>

                  {/* Score */}
                  <div className="text-right shrink-0 w-20">
                    <div className="text-sm font-bold text-emerald-400 tabular-nums">{report.score_total ?? '—'}</div>
                    <div className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Score</div>
                  </div>

                  {/* Status */}
                  <span className={cn(
                    "px-2.5 py-1 rounded-full text-[9px] font-bold uppercase border shrink-0 flex items-center gap-1.5",
                    statusStyle[report.status]
                  )}>
                    {report.status === 'completed' && <CheckCircle2 size={10} />}
                    {report.status === 'generating' && <Loader2 size={10} className="animate-spin" />}
                    {report.status === 'failed' && <AlertTriangle size={10} />}
                    {report.status}
                  </span>

                  {/* Time */}
                  <div className="text-[10px] text-gray-600 font-mono flex items-center gap-1 shrink-0 w-20 justify-end">
                    <Clock size={10} />
                    {timeAgo(report.generated_at)}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {reports.length === 0 && (
              <div className="flex flex-col items-center gap-4 text-gray-600 py-20 text-center">
                <Sparkles size={32} className="opacity-30" />
                <p className="text-sm font-medium">No intelligence reports generated yet.</p>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      <OfferBriefDrawer offer={briefOffer} onClose={() => setBriefOffer(null)} />
    </div>
  );
}
