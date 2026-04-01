'use client';

import React, { useEffect, useState } from 'react';
import { Terminal, Activity, CheckCircle2, AlertTriangle, RefreshCw, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassCard from '@/components/GlassCard';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface Job {
  id: string;
  job_type: string;
  job_status: 'completed' | 'failed' | 'running' | 'queued';
  records_processed: number | null;
  error_message: string | null;
  queued_at: string;
  completed_at: string | null;
}

interface Stat {
  job_type: string;
  job_status: string;
  count: number;
  last_run: string | null;
  total_processed: number | null;
}

const statusColors = {
  completed: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  failed: 'text-red-400 bg-red-500/10 border-red-500/20',
  running: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  queued: 'text-gray-400 bg-white/5 border-white/10',
};

const statusIcons = {
  completed: <CheckCircle2 size={12} className="text-emerald-500" />,
  failed: <AlertTriangle size={12} className="text-red-500" />,
  running: <Activity size={12} className="text-amber-500 animate-pulse" />,
  queued: <Clock size={12} className="text-gray-500" />,
};

function formatTime(dateStr?: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function SyncTerminal() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTerminalData = async () => {
    try {
      const [jobsRes, statsRes] = await Promise.all([
        fetch('/api/nexus/jobs?limit=50'),
        fetch('/api/nexus/jobs/stats')
      ]);

      const jobsJson = await jobsRes.json().catch(() => ({ success: false, data: [], error: 'Jobs endpoint failed' }));
      const statsJson = await statsRes.json().catch(() => ({ success: false, data: [], error: 'Stats endpoint failed' }));

      if (!jobsJson.success) setError(jobsJson.error || 'Failed to fetch job history');
      else setJobs(jobsJson.data);

      if (statsJson.success) setStats(statsJson.data);
      // Stats failure is non-critical — metrics just show 0
    } catch (err: unknown) {
      setError((err as Error).message || 'Connection aborted.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTerminalData();
    const interval = setInterval(fetchTerminalData, 10000);
    return () => clearInterval(interval);
  }, []);

  const totalProcessed = stats.reduce((acc, curr) => acc + (curr.total_processed || 0), 0);
  const totalFailed = stats.filter(s => s.job_status === 'failed').reduce((acc, curr) => acc + curr.count, 0);

  return (
    <div className="p-10 max-w-[1600px] mx-auto ml-[var(--sidebar-w)] min-h-screen">
      <header className="mb-10 flex justify-between items-end">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
            <Terminal size={14} />
            Diagnostics & Operations
          </div>
          <h1 className="text-3xl font-bold tracking-tighter text-white uppercase italic">
            Sync Terminal
          </h1>
          <p className="text-gray-500 font-medium">
            Real-time ingestion and computation pipeline logs.
          </p>
        </div>
        
        <div className="flex items-center gap-8 text-right">
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-gray-600 mb-1">Records Processed (7d)</div>
            <div className="text-2xl font-bold text-primary tabular-nums">
              {totalProcessed.toLocaleString()}
            </div>
          </div>
          <div className="h-10 w-px bg-white/5" />
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-gray-600 mb-1">Pipeline Failures (7d)</div>
            <div className={cn("text-2xl font-bold tabular-nums", totalFailed > 0 ? "text-red-500" : "text-gray-500")}>
              {totalFailed}
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <GlassCard className="flex flex-col items-center justify-center py-20 text-center border-red-500/20 bg-red-500/5">
           <AlertTriangle size={32} className="text-red-500 mb-4" />
           <h3 className="text-xl font-bold text-red-500 mb-2">Terminal Offline</h3>
           <p className="text-red-400/80 text-sm max-w-sm mx-auto">{error}</p>
        </GlassCard>
      ) : (
        <GlassCard className="p-0 border-white/5 overflow-hidden flex flex-col h-[calc(100vh-220px)] bg-[#0a0a0f]">
          {/* Terminal Toolbar */}
          <div className="bg-black/40 border-b border-white/5 p-4 flex items-center justify-between shrink-0">
             <div className="flex gap-2">
               <div className="w-3 h-3 rounded-full bg-red-500/50" />
               <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
               <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
             </div>
             <div className="text-xs font-mono text-gray-500 flex items-center gap-2">
               <RefreshCw size={12} className={cn(loading ? "animate-spin" : "")} />
               {loading ? "FETCHING_QUEUE..." : "LIVE_CONNECTION_ACTIVE"}
             </div>
          </div>

          {/* Terminal Output Stream */}
          <div className="flex-1 overflow-y-auto p-6 font-mono text-[11px] leading-relaxed space-y-1">
            <AnimatePresence>
              {jobs.map((job, idx) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  className="flex gap-4 py-1.5 hover:bg-white/[0.02] -mx-4 px-4 transition-colors"
                >
                  <div className="text-gray-600 shrink-0 w-20">
                    {formatTime(job.queued_at)}
                  </div>
                  
                  <div className="shrink-0 w-28 flex items-center">
                    <span className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] uppercase font-bold border", statusColors[job.job_status])}>
                      {statusIcons[job.job_status]}
                      {job.job_status}
                    </span>
                  </div>

                  <div className="text-gray-300 w-48 shrink-0 font-bold uppercase tracking-wider text-[10px]">
                    [{job.job_type}]
                  </div>

                  <div className="flex-1 flex flex-col justify-center">
                    {job.job_status === 'failed' && job.error_message ? (
                      <span className="text-red-400 break-words">{job.error_message}</span>
                    ) : (
                      <span className="text-gray-400">
                        {job.job_status === 'running' ? 'Executing pipeline strategy...' : 'Job successfully completed.'}
                        {job.records_processed != null && job.records_processed > 0 && (
                          <span className="text-primary ml-2">Processed: {job.records_processed} items.</span>
                        )}
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {!loading && jobs.length === 0 && (
              <div className="text-gray-600 text-center py-10 italic">
                No pipeline jobs found in the queue logging system.
              </div>
            )}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
