'use client';

import React, { useEffect, useState } from 'react';
import { Search, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import GlassCard from '@/components/GlassCard';
import { cn } from '@/lib/utils';

interface Offer {
  id: string;
  name: string;
  vertical: string;
  tier: string;
  score_total: number;
  keyword_count: number;
}

interface Keyword {
  id: string;
  keyword: string;
  intent: string;
  avg_monthly_searches: number;
  competition_level: string;
  avg_cpc: number;
  suggested_bid: number;
}

const intentStyle: Record<string, string> = {
  transactional: 'bg-blue-500/10 border border-blue-500/20 text-blue-400',
  commercial: 'bg-purple-500/10 border border-purple-500/20 text-purple-400',
  informational: 'bg-white/5 border border-white/10 text-gray-400',
};

const tierBadge: Record<string, string> = {
  A: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  B: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
  C: 'bg-gray-500/10 border-gray-500/20 text-gray-400',
};

export default function KeywordsPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [keywordsLoading, setKeywordsLoading] = useState(false);
  const [offersError, setOffersError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOffers = async () => {
      try {
        const res = await fetch('/api/nexus/offers?limit=200'); // max supported by API
        const json = await res.json();
        if (json.success) {
          setOffers(json.data);
        } else {
          setOffersError(json.error || 'Failed to fetch offers');
        }
      } catch (err: unknown) {
        setOffersError((err as Error).message || 'Connection aborted');
      } finally {
        setOffersLoading(false);
      }
    };
    fetchOffers();
  }, []);

  const handleSelectOffer = async (offer: Offer) => {
    setSelectedOffer(offer);
    setKeywords([]);
    setKeywordsLoading(true);
    try {
      const res = await fetch(`/api/nexus/keywords/${offer.id}?limit=500`); // max supported by API
      const json = await res.json();
      if (json.success) {
        setKeywords(json.data);
      } else {
        toast.error(json.error || 'Failed to fetch keywords');
      }
    } catch (err: unknown) {
      toast.error('Connection aborted: ' + (err as Error).message);
    } finally {
      setKeywordsLoading(false);
    }
  };

  return (
    <div className="p-10 max-w-[1600px] mx-auto ml-[var(--sidebar-w)] min-h-screen">
      <header className="mb-10">
        <Link
          href="/"
          className="flex items-center gap-2 text-primary hover:text-white transition-colors mb-4 group h-fit w-fit"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-xs font-bold uppercase tracking-widest">Operator HUD</span>
        </Link>
        <h1 className="text-3xl font-bold tracking-tighter text-white uppercase italic">
          Keyword Alpha
        </h1>
        <p className="text-gray-500 font-medium">
          Explore high-intent keyword intelligence by offer.
        </p>
      </header>

      <div className="flex gap-6 h-[calc(100vh-220px)]">
        {/* Left panel — offer list */}
        <div className="w-1/3 flex flex-col min-h-0">
          <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-3 px-1">
            Offers ({offers.length})
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-white/10">
            {offersLoading && (
              <div className="text-gray-600 text-xs font-medium px-1">Loading offers…</div>
            )}
            {offersError && (
              <div className="text-red-400 border border-red-500/20 bg-red-500/5 p-3 rounded-xl text-xs font-medium text-center">{offersError}</div>
            )}
            {!offersLoading && !offersError && offers.map(offer => (
              <button
                key={offer.id}
                onClick={() => handleSelectOffer(offer)}
                className={cn(
                  "w-full text-left rounded-2xl p-4 transition-all border",
                  selectedOffer?.id === offer.id
                    ? "bg-primary/10 border-primary/20 shadow-[0_0_15px_-5px_rgba(59,130,246,0.4)]"
                    : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10"
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span
                    className={cn(
                      "text-sm font-bold leading-tight truncate max-w-[180px]",
                      selectedOffer?.id === offer.id ? "text-primary" : "text-white"
                    )}
                  >
                    {offer.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border",
                      tierBadge[offer.tier] ?? tierBadge['C']
                    )}
                  >
                    {offer.tier}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-500 font-medium">
                  <span>{offer.vertical}</span>
                  <span className="flex items-center gap-1">
                    <Search size={9} />
                    {offer.keyword_count} kw
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right panel — keyword table */}
        <div className="flex-1 min-w-0 flex flex-col">
          {!selectedOffer ? (
            <GlassCard className="flex-1 flex items-center justify-center border-white/5">
              <div className="text-center">
                <Search size={32} className="text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 font-medium text-sm">
                  Select an offer to load keyword intelligence
                </p>
              </div>
            </GlassCard>
          ) : (
            <GlassCard className="flex-1 flex flex-col overflow-hidden border-white/5 p-0">
              <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0">
                <div>
                  <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-0.5">
                    {selectedOffer.vertical}
                  </div>
                  <h2 className="text-lg font-bold text-white">{selectedOffer.name}</h2>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-gray-600 mb-0.5">
                    Keywords
                  </div>
                  <div className="text-xl font-bold text-primary tabular-nums">
                    {keywordsLoading ? '…' : keywords.length}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {keywordsLoading ? (
                  <div className="flex items-center justify-center h-32 text-gray-600 text-xs font-medium">
                    Loading keywords…
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[#0a0a0f]">
                      <tr className="border-b border-white/5">
                        <th className="text-left px-5 py-3 text-[10px] uppercase tracking-widest font-bold text-gray-600">
                          Keyword
                        </th>
                        <th className="text-left px-5 py-3 text-[10px] uppercase tracking-widest font-bold text-gray-600">
                          Intent
                        </th>
                        <th className="text-right px-5 py-3 text-[10px] uppercase tracking-widest font-bold text-gray-600">
                          Monthly Searches
                        </th>
                        <th className="text-left px-5 py-3 text-[10px] uppercase tracking-widest font-bold text-gray-600">
                          Competition
                        </th>
                        <th className="text-right px-5 py-3 text-[10px] uppercase tracking-widest font-bold text-gray-600">
                          Avg CPC
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {keywords.map(kw => (
                        <tr
                          key={kw.id}
                          className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="px-5 py-3 font-medium text-white">{kw.keyword}</td>
                          <td className="px-5 py-3">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase",
                                intentStyle[kw.intent] ?? intentStyle['informational']
                              )}
                            >
                              {kw.intent}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right text-white tabular-nums font-medium">
                            {kw.avg_monthly_searches != null
                              ? kw.avg_monthly_searches.toLocaleString()
                              : '—'}
                          </td>
                          <td className="px-5 py-3 text-gray-400 capitalize font-medium">
                            {kw.competition_level ?? '—'}
                          </td>
                          <td className="px-5 py-3 text-right text-emerald-400 tabular-nums font-bold">
                            {kw.avg_cpc != null ? `$${kw.avg_cpc.toFixed(2)}` : '—'}
                          </td>
                        </tr>
                      ))}
                      {keywords.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-5 py-10 text-center text-gray-600 font-medium">
                            No keywords found for this offer.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
