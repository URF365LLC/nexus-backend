'use client';

import React, { useEffect, useState } from 'react';
import { Shield, ShieldAlert, CheckCircle2, XCircle, Globe, Smartphone, Mail, MousePointer2, AlertTriangle, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassCard from '@/components/GlassCard';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface ComplianceOffer {
  id: string;
  mb_campaign_id: number;
  name: string;
  vertical: string;
  search_restriction: string | null;
  email_rules: string | null;
  email_subject_lines: string | null;
  email_from_lines: string | null;
  suppression_required: boolean;
  traffic_search: boolean;
  traffic_social: boolean;
  traffic_native: boolean;
  traffic_display: boolean;
  traffic_email: boolean;
  traffic_mobile: boolean;
  traffic_push: boolean;
  os_list: string[] | null;
  geo_filtering: boolean;
  allowed_countries: string[];
}

export default function ComplianceMatrix() {
  const [offers, setOffers] = useState<ComplianceOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchComplianceData = async () => {
      try {
        const res = await fetch('/api/nexus/offers/compliance');
        const json = await res.json();
        if (json.success) {
          setOffers(json.data);
        } else {
          setError(json.error || 'Failed to fetch compliance registry');
        }
      } catch (err: unknown) {
        setError((err as Error).message || 'Connection aborted');
      } finally {
        setLoading(false);
      }
    };
    fetchComplianceData();
  }, []);

  const filteredOffers = offers.filter(o => o.name.toLowerCase().includes(search.toLowerCase()) || o.vertical.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-10 max-w-[1600px] mx-auto ml-[var(--sidebar-w)] min-h-screen">
      <header className="mb-10 flex justify-between items-end">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
            <Shield size={14} />
            Network Policy Enforcement
          </div>
          <h1 className="text-3xl font-bold tracking-tighter text-white uppercase italic">
            Compliance Registry
          </h1>
          <p className="text-gray-500 font-medium">
            Whitelist boundaries and traffic source restrictions for active campaigns.
          </p>
        </div>
        <div className="w-72 relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search campaigns..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>
      </header>

      {error ? (
        <GlassCard className="flex flex-col items-center justify-center py-20 text-center border-red-500/20 bg-red-500/5">
           <AlertTriangle size={32} className="text-red-500 mb-4" />
           <h3 className="text-xl font-bold text-red-500 mb-2">Registry Offline</h3>
           <p className="text-red-400/80 text-sm max-w-sm mx-auto">{error}</p>
        </GlassCard>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-500 text-xs uppercase tracking-widest font-bold animate-pulse flex items-center gap-3">
             <Shield size={16} className="text-primary" />
             Synchronizing compliance boundary data...
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 pb-20">
          <AnimatePresence>
            {filteredOffers.map((offer, idx) => (
              <motion.div
                key={offer.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.05, 0.5) }}
              >
                <GlassCard className="p-0 overflow-hidden border-white/5 group hover:border-white/20 transition-colors">
                  <div className="p-6 flex flex-col xl:flex-row gap-8">
                    {/* Left: Offer Core */}
                    <div className="xl:w-1/4 flex flex-col justify-between border-b xl:border-b-0 xl:border-r border-white/5 pb-6 xl:pb-0 xl:pr-6">
                      <div>
                        <div className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-2">
                          {offer.vertical}
                        </div>
                        <h3 className="text-lg font-bold text-white leading-tight mb-4">
                          {offer.name}
                        </h3>
                        <div className="flex flex-wrap gap-2 mb-4">
                          {offer.geo_filtering && offer.allowed_countries.length > 0 ? (
                            offer.allowed_countries.slice(0, 5).map(geo => (
                              <span key={geo} className="px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold text-blue-400">
                                {geo}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                              <Globe size={10} /> Global Traffic
                            </span>
                          )}
                          {offer.geo_filtering && offer.allowed_countries.length > 5 && (
                            <span className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[10px] font-bold text-gray-400">
                              +{offer.allowed_countries.length - 5}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 text-[10px] font-bold text-gray-500">
                        ID: {offer.mb_campaign_id}
                      </div>
                    </div>

                    {/* Middle: Traffic Whitelist */}
                    <div className="xl:w-1/4 pt-6 xl:pt-0 border-b xl:border-b-0 xl:border-r border-white/5 pb-6 xl:pb-0 xl:pr-6">
                      <div className="text-xs uppercase font-bold tracking-widest text-gray-500 mb-4 flex items-center gap-2">
                        <MousePointer2 size={12} />
                        Traffic Whitelist
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <TrafficFlag label="Search" active={offer.traffic_search} />
                        <TrafficFlag label="Social" active={offer.traffic_social} />
                        <TrafficFlag label="Native" active={offer.traffic_native} />
                        <TrafficFlag label="Display" active={offer.traffic_display} />
                        <TrafficFlag label="Email" active={offer.traffic_email} />
                        <TrafficFlag label="Mobile" active={offer.traffic_mobile} />
                        <TrafficFlag label="Push" active={offer.traffic_push} />
                      </div>
                    </div>

                    {/* Right: Restrictions Matrix */}
                    <div className="flex-1 pt-6 xl:pt-0">
                      <div className="text-xs uppercase font-bold tracking-widest mb-4 flex items-center gap-2 text-amber-500/80">
                        <ShieldAlert size={12} />
                        Explicit Restrictions
                      </div>
                      
                      {offer.search_restriction || offer.email_rules || offer.suppression_required || offer.email_subject_lines ? (
                        <div className="grid lg:grid-cols-2 gap-4">
                          {offer.search_restriction && (
                            <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/20">
                              <div className="text-[10px] uppercase font-bold text-orange-500 mb-1 tracking-widest">Search Policy</div>
                              <p className="text-xs text-orange-300/80 leading-relaxed font-medium">
                                {offer.search_restriction}
                              </p>
                            </div>
                          )}
                          
                          {(offer.email_rules || offer.suppression_required || offer.email_subject_lines) && (
                            <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20">
                              <div className="text-[10px] uppercase font-bold text-purple-500 mb-1 tracking-widest flex justify-between items-center h-4">
                                <span>Email Compliance</span>
                                {offer.suppression_required && <span className="text-red-400 bg-red-500/20 px-1.5 py-0.5 rounded text-[8px]">SUPPRESSION REQ</span>}
                              </div>
                              {offer.email_rules && (
                                <p className="text-xs text-purple-300/80 leading-relaxed font-medium mb-2 mt-2">
                                  {offer.email_rules}
                                </p>
                              )}
                              {offer.email_subject_lines && (
                                <div className="mt-2 text-[10px] text-gray-400 border-t border-purple-500/10 pt-2 line-clamp-2 leading-relaxed">
                                  <span className="font-bold text-purple-400/80">Subject: </span> {offer.email_subject_lines}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center p-8 rounded-xl bg-emerald-500/5 border border-emerald-500/10 h-full">
                          <div className="flex flex-col items-center gap-2 text-emerald-500/80">
                            <CheckCircle2 size={24} />
                            <span className="text-xs font-bold uppercase tracking-widest">No Explicit Restrictions</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatePresence>
          {!loading && filteredOffers.length === 0 && (
            <div className="flex flex-col items-center gap-4 text-gray-600 text-center py-20 italic">
               <ShieldAlert size={32} className="opacity-50" />
               <p className="text-sm font-medium">No offers match your registry filter criteria.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TrafficFlag({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors",
      active ? "text-emerald-400" : "text-gray-600 opacity-50"
    )}>
      {active ? <CheckCircle2 size={12} className="text-emerald-500" /> : <XCircle size={12} />}
      {label}
    </div>
  );
}
