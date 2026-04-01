'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Brain, Cpu, Terminal, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import GlassCard from './GlassCard';

interface FeedItem {
  id: string;
  type: 'report' | 'job' | 'system';
  content: string;
  timestamp: string;
  priority?: 'high' | 'medium' | 'low';
  href?: string;
}

interface ReportRecord {
  id: string;
  offer_name: string;
  status: string;
  tier: string;
  score_total: number;
  generated_at: string;
}

interface JobRecord {
  id: string;
  job_type: string;
  job_status: string;
  records_processed: number | null;
  error_message: string | null;
  completed_at: string | null;
  queued_at: string;
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

function mapReports(reports: ReportRecord[]): FeedItem[] {
  return reports.map((r) => {
    const isFailed = r.status === 'failed';
    return {
      id: `report-${r.id}`,
      type: isFailed ? 'system' : 'report',
      content: isFailed
        ? `Report generation failed for "${r.offer_name}".`
        : `AI report ready for "${r.offer_name}". Tier ${r.tier} — score ${r.score_total}.`,
      timestamp: timeAgo(r.generated_at),
      priority: isFailed ? 'high' : r.tier === 'A' ? 'medium' : undefined,
      href: isFailed ? undefined : '/reports',
    };
  });
}

function mapJobs(jobs: JobRecord[]): FeedItem[] {
  return jobs.map((j) => {
    const dateStr = j.completed_at ?? j.queued_at;
    const processed = j.records_processed != null ? ` ${j.records_processed} records processed.` : '';
    const errMsg = j.error_message ? ` Error: ${j.error_message}` : '';
    return {
      id: `job-${j.id}`,
      type: 'job',
      content: `Pipeline job "${j.job_type}" — status: ${j.job_status}.${processed}${errMsg}`,
      timestamp: timeAgo(dateStr),
    };
  });
}

async function fetchFeed(): Promise<FeedItem[]> {
  const [reportsRes, jobsRes] = await Promise.all([
    fetch('/api/nexus/reports?limit=5'),
    fetch('/api/nexus/jobs?limit=8'),
  ]);

  const reportsJson = await reportsRes.json();
  const jobsJson = await jobsRes.json();

  const reports: FeedItem[] = reportsJson.success ? mapReports(reportsJson.data) : [];
  const jobs: FeedItem[] = jobsJson.success ? mapJobs(jobsJson.data) : [];

  const combined = [...reports, ...jobs];
  // Keep insertion order — already sorted by recency from API
  return combined;
}

export default function IntelligenceFeed({ className }: { className?: string }) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const items = await fetchFeed();
      setFeed(items);
    } catch {
      // Preserve existing feed on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <GlassCard className={cn("flex flex-col h-full", className)}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-bold tracking-widest text-primary uppercase flex items-center gap-2">
          <Brain size={16} />
          Intelligence Stream
        </h3>
        <div className="text-[10px] text-gray-500 font-mono flex items-center gap-1">
          {loading ? (
            <Loader2 size={10} className="animate-spin text-emerald-500" />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          )}
          LIVE
        </div>
      </div>

      <div className="space-y-4 overflow-y-auto pr-2 scrollbar-hide flex-1">
        <AnimatePresence mode="popLayout">
          {feed.map((item, idx) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="group relative"
            >
              {item.href ? (
                <Link href={item.href} className="flex gap-4 p-3 rounded-xl hover:bg-white/[0.03] transition-colors border border-transparent hover:border-white/5 cursor-pointer">
                  <div className={cn(
                    "mt-0.5 p-2 rounded-lg bg-white/5 border border-white/5 text-gray-400 group-hover:text-primary transition-colors h-fit",
                    item.priority === 'high' && "text-amber-500/80 bg-amber-500/5"
                  )}>
                    {getIcon(item.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1 text-[10px] font-bold uppercase tracking-tighter text-gray-500">
                      <span className={cn(
                        item.type === 'report' && "text-blue-400",
                        item.type === 'job' && "text-purple-400"
                      )}>
                        {item.type}
                      </span>
                      <span className="font-mono flex items-center gap-1 opacity-60">
                        <Clock size={10} />
                        {item.timestamp}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed font-medium text-gray-300">
                      {item.content}
                    </p>
                  </div>
                </Link>
              ) : (
              <div className="flex gap-4 p-3 rounded-xl hover:bg-white/[0.03] transition-colors border border-transparent hover:border-white/5">
                <div className={cn(
                  "mt-0.5 p-2 rounded-lg bg-white/5 border border-white/5 text-gray-400 group-hover:text-primary transition-colors h-fit",
                  item.priority === 'high' && "text-amber-500/80 bg-amber-500/5"
                )}>
                  {getIcon(item.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1 text-[10px] font-bold uppercase tracking-tighter text-gray-500">
                    <span className={cn(
                      item.type === 'report' && "text-blue-400",
                      item.type === 'job' && "text-purple-400"
                    )}>
                      {item.type}
                    </span>
                    <span className="font-mono flex items-center gap-1 opacity-60">
                      <Clock size={10} />
                      {item.timestamp}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed font-medium text-gray-300">
                    {item.content}
                  </p>
                </div>
              </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <Link href="/reports" className="mt-4 w-full py-2.5 bg-white/5 border border-white/5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:bg-white/[0.08] hover:text-white transition-all flex items-center justify-center">
        View All Synthesis
      </Link>
    </GlassCard>
  );
}

function getIcon(type: FeedItem['type']) {
  switch (type) {
    case 'report': return <Sparkles size={14} />;
    case 'job': return <Cpu size={14} />;
    case 'system': return <Terminal size={14} />;
    default: return <Brain size={14} />;
  }
}
