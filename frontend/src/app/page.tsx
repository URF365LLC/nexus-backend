'use client';

import React, { useEffect, useState } from 'react';
import { 
  Target, 
  Search, 
  TrendingUp,
  CheckCircle2,
  Clock,
  Zap,
  Activity,
  ArrowUpRight,
  ZapIcon
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useNexusStore } from '@/store/useStore';
import GlassCard from '@/components/GlassCard';
import IntelligenceFeed from '@/components/IntelligenceFeed';
import CampaignVisualizer from '@/components/CampaignVisualizer';
import OfferBriefDrawer from '@/components/OfferBriefDrawer';
import { cn } from '@/lib/utils';
import { Offer } from '@/types';

export default function Dashboard() {
  const { dashboardData, setDashboardData } = useNexusStore();
  const [loading, setLoading] = useState(!dashboardData);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [briefOffer, setBriefOffer] = useState<Offer | null>(null);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/nexus/dashboard');
      const json = await res.json();
      if (json.success) {
        setDashboardData(json.data);
        setLastSync(new Date());
        setError(null);
      } else {
        setError(json.error || 'Failed to fetch dashboard');
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // 30s polling
    return () => clearInterval(interval);
  }, []);

  const triggerSync = async () => {
    try {
      setLoading(true);
      toast.loading('Initiating global sync pipeline...', { id: 'sync' });
      
      const res = await fetch('/api/nexus/sync/full', { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        toast.success('Sync pipeline successfully dispatched to Nexus.', { id: 'sync' });
        setTimeout(fetchData, 2000); // refresh after a short delay
      } else {
        toast.error('Sync pipeline failed to execute.', { id: 'sync' });
      }
    } catch (err: unknown) {
      toast.error('Connection aborted: ' + (err as Error).message, { id: 'sync' });
    } finally {
      setLoading(false);
    }
  };

  if (loading && !dashboardData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-white stellar-grid">
        <motion.div 
          animate={{ scale: [1, 1.05, 1], opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-16 h-16 rounded-3xl bg-primary/20 border border-primary/30 flex items-center justify-center relative">
             <Zap size={32} className="text-primary fill-primary animate-pulse" />
             <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
          </div>
          <div className="text-primary font-bold text-xl tracking-[0.2em] uppercase">Initializing Nexus</div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="pb-20">

      {/* Main Viewport */}
      <main className="ml-[var(--sidebar-w)] p-10 max-w-[1600px] mx-auto">
        {/* Dynamic Header */}
        <header className="flex justify-between items-end mb-12">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary uppercase tracking-widest">Operator Console</span>
              {error && <span className="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-[10px] font-bold text-red-500 uppercase tracking-widest">Link Lost</span>}
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white mb-2">System Synthesis</h1>
            <p className="text-gray-500 font-medium">Real-time intelligence orchestration for Tier-Alpha campaigns.</p>
          </div>

          <div className="flex items-center gap-6 text-right">
             <div className="hidden xl:block">
                <div className="text-[10px] uppercase tracking-widest font-bold text-gray-600 mb-1">Active Offers</div>
                <div className="text-xl font-bold tabular-nums">{dashboardData?.system.active_offers || 0}</div>
             </div>
             <div className="h-10 w-px bg-white/5 hidden xl:block" />
             <div>
                <div className="text-[10px] uppercase tracking-widest font-bold text-gray-600 mb-1">Last Sync Cycle</div>
                <div className="text-sm font-mono font-bold text-gray-300 flex items-center justify-end gap-2">
                  <Clock size={14} className="text-primary" />
                  {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
             </div>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-12 gap-8">
          
          {/* Key Metrics HUD */}
          <div className="col-span-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatHUD
               label="Alpha Tier Reach"
               value={dashboardData?.tiers['A']?.count || 0}
               icon={<TrendingUp size={20} className="text-blue-500" />}
               trend={dashboardData?.tiers['A']?.avg_score ? `Avg Score: ${dashboardData.tiers['A'].avg_score}` : '—'}
               color="blue"
            />
            <StatHUD 
               label="Keyword Validation" 
               value={Math.round((dashboardData?.keyword_coverage.validated_keywords || 0) / (dashboardData?.keyword_coverage.total_keywords || 1) * 100) + '%'} 
               icon={<Search size={20} className="text-purple-500" />} 
               trend="High Confidence"
               color="purple"
            />
            <StatHUD
               label="Intelligence Reports"
               value={dashboardData?.reports.ready || 0}
               icon={<CheckCircle2 size={20} className="text-emerald-500" />}
               trend={dashboardData?.reports.generating ? `${dashboardData.reports.generating} Processing` : 'All Ready'}
               color="emerald"
            />
            <StatHUD
               label="Keyword Depth"
               value={dashboardData?.keyword_coverage.avg_keywords_per_offer ? Math.round(Number(dashboardData.keyword_coverage.avg_keywords_per_offer)).toLocaleString() : '—'}
               icon={<ZapIcon size={20} className="text-amber-500" />}
               trend="Avg per Offer"
               color="amber"
            />
          </div>

          {/* Visualization & Core Feed */}
          <div className="col-span-12 lg:col-span-8 space-y-8">
            <CampaignVisualizer className="h-[450px]" />
            
            <GlassCard noPadding className="border-primary/10">
              <div className="p-6 border-b border-white/5 flex justify-between items-center">
                <h2 className="font-bold text-sm tracking-widest uppercase flex items-center gap-2">
                  <Activity size={18} className="text-blue-500" />
                  Alpha Tier Performance
                </h2>
                <Link href="/campaigns" className="text-[10px] font-bold text-primary hover:text-white transition-colors uppercase tracking-widest">
                  Detailed Analysis
                </Link>
              </div>
              <div className="divide-y divide-white/5 h-[400px] overflow-y-auto">
                <AnimatePresence>
                  {dashboardData?.top_offers.map((offer: Offer, i: number) => (
                    <motion.div
                      key={offer.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => setBriefOffer(offer)}
                      className="p-4 hover:bg-white/[0.02] transition-colors flex items-center gap-4 group cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center font-bold text-gray-500 tabular-nums text-xs">
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-white text-sm group-hover:text-primary transition-colors">{offer.name}</div>
                        <div className="flex items-center gap-3 text-[10px] uppercase font-bold text-gray-600 tracking-tighter">
                          <span className="text-gray-500">{offer.vertical}</span>
                          <span className="w-1 h-1 rounded-full bg-white/5" />
                          <span>{offer.keyword_count} Keywords</span>
                        </div>
                      </div>
                      <div className="text-right">
                         <div className="flex items-center gap-1 text-emerald-400 font-bold text-sm tabular-nums">
                            {offer.score_total}
                            <ArrowUpRight size={14} className="opacity-50" />
                         </div>
                         <div className="text-[9px] uppercase tracking-widest text-gray-600 font-bold">Nexus Score</div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </GlassCard>
          </div>

          {/* Intelligence & Actions */}
          <div className="col-span-12 lg:col-span-4 space-y-8">
            <IntelligenceFeed className="h-[550px]" />
            
            <GlassCard className="bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
               <h3 className="text-xs font-bold tracking-[0.2em] text-blue-300 uppercase mb-4">Pipeline Execution</h3>
               <p className="text-xs text-blue-400/60 leading-relaxed mb-6 font-medium">
                 Force a manual refresh of all keyword metrics and MaxBounty offer metadata globally.
               </p>
               <button 
                 onClick={triggerSync}
                 disabled={loading}
                 className="w-full py-3 bg-primary text-white rounded-xl text-xs font-bold hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] transition-all disabled:opacity-50"
               >
                 Execute Global Sync
               </button>
            </GlassCard>
            
            <div className="p-1 px-4 flex justify-between items-center text-[10px] font-mono text-gray-600 uppercase">
               <span>{dashboardData ? `${dashboardData.system.tier_a || 0}A · ${dashboardData.system.tier_b || 0}B · ${dashboardData.system.tier_c || 0}C Tiers` : 'Loading...'}</span>
               <span>Stellar Engine Active</span>
            </div>
          </div>

        </div>
      </main>

      <OfferBriefDrawer offer={briefOffer} onClose={() => setBriefOffer(null)} />
    </div>
  );
}

// --- Sub-components (Scoped to File) ---

function StatHUD({ label, value, icon, trend, color }: { label: string; value: React.ReactNode; icon: React.ReactNode; trend: string; color: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-500',
    purple: 'text-purple-500',
    emerald: 'text-emerald-500',
    amber: 'text-amber-500',
  };

  return (
    <GlassCard className="hover:border-white/10 transition-colors">
      <div className="flex justify-between items-start mb-6">
         <div className="p-2 rounded-xl bg-white/5 border border-white/5">
            {icon}
         </div>
         <div className="text-[10px] font-bold text-gray-600 uppercase tracking-[0.2em]">{label}</div>
      </div>
      <div className="text-3xl font-bold tracking-tight text-white mb-2 tabular-nums">{value}</div>
      <div className={cn("text-[10px] font-bold uppercase tracking-widest flex items-center gap-1", colors[color])}>
        {trend}
      </div>
    </GlassCard>
  );
}
