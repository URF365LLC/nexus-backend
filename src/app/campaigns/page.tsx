'use client';

import React, { useEffect, useState } from 'react';
import { 
  ArrowLeft, 
  ExternalLink, 
  Brain, 
  TrendingUp, 
  Search, 
  FileText, 
  ShieldCheck, 
  LayoutGrid,
  Zap
} from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import GlassCard from '@/components/GlassCard';
import OfferBriefDrawer from '@/components/OfferBriefDrawer';
import DeployModal from '@/components/DeployModal';
import { cn } from '@/lib/utils';
import { Offer } from '@/types';

export default function CampaignsPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [tierFilter, setTierFilter] = useState<'All' | 'A' | 'B' | 'C'>('All');
  const [briefOffer, setBriefOffer] = useState<Offer | null>(null);
  const [deployOffer, setDeployOffer] = useState<Offer | null>(null);

  useEffect(() => {
    const fetchOffers = async () => {
      try {
        const res = await fetch('/api/nexus/offers?limit=200'); // max supported by API
        const json = await res.json();
        if (json.success) {
          setOffers(json.data);
        } else {
          setError(json.error || 'Failed to fetch campaigns');
        }
      } catch (err: unknown) {
        setError((err as Error).message || 'Connection aborted');
      } finally {
        setLoading(false);
      }
    };
    fetchOffers();
  }, []);

  const filteredOffers = tierFilter === 'All' ? offers : offers.filter(o => o.tier === tierFilter);

  const handleSync = async (type: 'metrics' | 'synthesis') => {
    try {
      setSyncing(true);
      const endpoint = type === 'metrics' ? '/api/nexus/sync/offers' : '/api/nexus/sync/score';
      toast.loading(`Initiating ${type} pipeline...`, { id: 'campaign-sync' });

      const res = await fetch(endpoint, { method: 'POST' });
      // API returns 202 Accepted for async pipeline triggers
      if (res.status === 202 || res.status === 200) {
        toast.success(`${type === 'metrics' ? 'Metrics' : 'Synthesis'} pipeline queued successfully.`, { id: 'campaign-sync' });
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || `Failed to trigger ${type} pipeline.`, { id: 'campaign-sync' });
      }
    } catch (err: unknown) {
      toast.error('Connection aborted: ' + (err as Error).message, { id: 'campaign-sync' });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return (
    <div className="p-10 max-w-[1600px] mx-auto ml-[var(--sidebar-w)]">
      <div className="h-16 w-72 rounded-2xl bg-white/5 animate-pulse mb-12" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-64 rounded-3xl bg-white/[0.03] border border-white/5 animate-pulse" />
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-10 max-w-[1600px] mx-auto ml-[var(--sidebar-w)]">
      <header className="mb-12 flex items-center justify-between">
        <div>
          <Link href="/" className="flex items-center gap-2 text-primary hover:text-white transition-colors mb-4 group h-fit w-fit">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-xs font-bold uppercase tracking-widest">Operator HUD</span>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-white uppercase italic tracking-tighter">Campaign Matrix</h1>
          <p className="text-gray-500 font-medium">Deep-dive intelligence for Tier-Alpha performance marketing.</p>
        </div>
        
        <div className="flex items-center gap-4">
           <button 
             onClick={() => handleSync('metrics')}
             disabled={syncing}
             className="px-5 py-2.5 bg-primary/10 border border-primary/20 text-primary rounded-xl text-xs font-bold hover:bg-primary/20 transition-all uppercase tracking-widest disabled:opacity-50"
           >
             Sync Metrics
           </button>
           <button 
             onClick={() => handleSync('synthesis')}
             disabled={syncing}
             className="px-5 py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary/80 transition-all uppercase tracking-widest shadow-[0_0_20px_rgba(59,130,246,0.3)] disabled:opacity-50"
           >
             Force Synthesis
           </button>
        </div>
      </header>

      {/* Tier Filter */}
      <div className="flex items-center gap-2 mb-8">
        {(['All', 'A', 'B', 'C'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTierFilter(t)}
            className={cn(
              "px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border",
              tierFilter === t
                ? "bg-primary/10 border-primary/30 text-primary shadow-[0_0_10px_-3px_rgba(59,130,246,0.5)]"
                : "bg-white/[0.03] border-white/5 text-gray-500 hover:text-white hover:bg-white/[0.06]"
            )}
          >
            {t === 'All' ? 'All Tiers' : `Tier ${t}`}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-600 font-medium tabular-nums">
          {filteredOffers.length} offers
        </span>
      </div>

      {error ? (
        <GlassCard className="flex flex-col items-center justify-center py-20 text-center border-red-500/20 bg-red-500/5 col-span-full">
           <Zap size={32} className="text-red-500 mb-4" />
           <h3 className="text-xl font-bold text-red-500 mb-2">Connection Lost</h3>
           <p className="text-red-400/80 text-sm max-w-sm mx-auto">{error}</p>
        </GlassCard>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {filteredOffers.map((offer, idx) => (
          <motion.div
            key={offer.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.05 }}
          >
            <GlassCard className="h-full border-white/5 hover:border-primary/20 transition-all group p-0 overflow-hidden flex flex-col">
               {/* Card Header Background */}
               <div className="h-2 rounded-t-22xl bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />
               
               <div className="p-6 flex flex-col flex-1">
                 <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-1">{offer.vertical}</div>
                      <h3 className="text-xl font-bold text-white group-hover:text-primary transition-colors leading-tight mb-2 truncate max-w-[200px]">
                        {offer.name}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400">Validated</span>
                        <span className="text-[10px] font-bold text-gray-600 uppercase">Tier {offer.tier} Alpha</span>
                      </div>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center font-bold text-primary tabular-nums">
                       {offer.score_total}
                    </div>
                 </div>

                 {/* Stats Breakdown */}
                 <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                       <div className="text-[9px] uppercase tracking-widest font-bold text-gray-600 mb-1 flex items-center gap-1">
                         <Search size={10} />
                         Keywords
                       </div>
                       <div className="text-lg font-bold text-white tabular-nums">{offer.keyword_count}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                       <div className="text-[9px] uppercase tracking-widest font-bold text-gray-600 mb-1 flex items-center gap-1">
                         <Brain size={10} />
                         Confidence
                       </div>
                       <div className="text-lg font-bold text-primary tabular-nums">
                         {offer.confidence_score != null ? `${Math.round(offer.confidence_score * 100)}%` : '—'}
                       </div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                       <div className="text-[9px] uppercase tracking-widest font-bold text-gray-600 mb-1 flex items-center gap-1">
                         <TrendingUp size={10} />
                         Payout
                       </div>
                       <div className="text-lg font-bold text-emerald-400 tabular-nums">
                         {offer.payout != null ? `$${offer.payout}` : '—'}
                       </div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                       <div className="text-[9px] uppercase tracking-widest font-bold text-gray-600 mb-1 flex items-center gap-1">
                         <Zap size={10} />
                         EPC
                       </div>
                       <div className="text-lg font-bold text-white tabular-nums">
                         {offer.epc != null ? `$${offer.epc}` : '—'}
                       </div>
                    </div>
                 </div>

                 {/* Quick Detail Sections */}
                 <div className="space-y-4 mb-8 flex-1">
                    <div className="flex items-center justify-between text-xs border-b border-white/5 pb-2">
                       <span className="text-gray-500 font-medium">Compliance Index</span>
                       <span className="text-emerald-400 font-bold flex items-center gap-1">
                         <ShieldCheck size={12} />
                         Whitelisted
                       </span>
                    </div>
                    <div className="flex items-center justify-between text-xs border-b border-white/5 pb-2">
                       <span className="text-gray-500 font-medium">Intelligence Brief</span>
                       <span className="text-blue-400 font-bold flex items-center gap-1">
                         <FileText size={12} />
                         Ready
                       </span>
                    </div>
                 </div>

                 {/* Action Bridge */}
                 <div className="flex gap-3">
                    <button onClick={() => setBriefOffer(offer)} className="flex-1 py-3 bg-white/5 hover:bg-white/[0.08] text-white rounded-xl text-xs font-bold transition-all border border-white/5 flex items-center justify-center gap-2 group">
                       <ExternalLink size={14} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                       View Brief
                    </button>
                    <button onClick={() => setDeployOffer(offer)} className="flex-1 py-3 bg-primary text-white rounded-xl text-xs font-bold transition-all hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:bg-primary/90 flex items-center justify-center gap-2">
                       <Zap size={14} className="fill-white" />
                       Deploy
                    </button>
                 </div>
               </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>
      )}

      <OfferBriefDrawer offer={briefOffer} onClose={() => setBriefOffer(null)} />
      <DeployModal offer={deployOffer} onClose={() => setDeployOffer(null)} />
    </div>
  );
}
