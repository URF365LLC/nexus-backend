'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Offer } from '@/types';

interface OfferBriefDrawerProps {
  offer: Offer | null;
  onClose: () => void;
}

type Tab = 'claude' | 'research' | 'studio' | 'metadata';

interface ReportData {
  offer_name: string;
  vertical: string;
  payout: string;
  tier: string;
  score_total: string;
  confidence_score: string;
  status: string;
  generated_at: string;
  full_report_md: string;
  section_market_trends: string;
  section_geo_opportunity: string;
  section_audience_profile: string;
  section_competitive_pressure: string;
  section_traffic_strategy: string;
  section_go_no_go: string;
}

export default function OfferBriefDrawer({ offer, onClose }: OfferBriefDrawerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('claude');
  const [report, setReport] = useState<ReportData | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!offer) {
      setReport(null);
      setError(false);
      setActiveTab('claude');
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(false);
      setReport(null);
      setProjects([]);
      try {
        const [reportRes, projectsRes] = await Promise.all([
          fetch(`/api/nexus/reports/${offer.id}`),
          fetch(`/api/nexus/studio/projects/${offer.id}`)
        ]);

        const reportJson = await reportRes.json();
        const projectsJson = await projectsRes.json();

        if (reportJson.success && reportJson.data) setReport(reportJson.data);
        if (projectsJson.success && projectsJson.data) setProjects(projectsJson.data);

        if (!reportJson.success && !projectsJson.success) setError(true);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [offer]);

  const handleCreateProject = async (persona: string, vibe: string) => {
    if (!offer) return;
    setCreatingProject(true);
    try {
      const res = await fetch('/api/nexus/studio/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': 'nexus_internal_key' // Should come from secure context
        },
        body: JSON.stringify({
          offerId: offer.id,
          name: `${offer.name} - ${persona} Strategy`,
          persona,
          vibe,
          alphaKeywords: [] // Optional: could pull from report
        })
      });

      const json = await res.json();
      if (json.success) {
        setProjects([json.data, ...projects]);
        setActiveTab('studio');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingProject(false);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'claude', label: 'Synthesis' },
    { key: 'research', label: 'Research' },
    { key: 'studio', label: 'Creative Studio' },
    { key: 'metadata', label: 'Metadata' },
  ];

  const tierColors: Record<string, string> = {
    A: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    B: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    C: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
  };

  return (
    <AnimatePresence>
      {offer && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            key="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-[600px] z-50 flex flex-col bg-[#0a0a0f]/95 backdrop-blur-xl border-l border-white/10 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-white/10 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white leading-tight">{offer.name}</h2>
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider',
                      tierColors[offer.tier || ''] ?? 'bg-white/5 border-white/10 text-gray-400'
                    )}
                  >
                    Tier {offer.tier}
                  </span>
                  <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                    {offer.vertical}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close drawer"
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all"
              >
                <X size={14} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-6 pt-4 pb-0 shrink-0">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'px-4 py-2 rounded-t-xl text-xs font-bold uppercase tracking-wider transition-all border border-b-0',
                    activeTab === tab.key
                      ? 'bg-white/[0.06] border-white/10 text-white'
                      : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto border-t border-white/10 p-6">
              {loading && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-widest">Loading report...</p>
                  </div>
                </div>
              )}

              {!loading && error && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-gray-400 font-medium mb-1">No report available</p>
                    <p className="text-xs text-gray-600">The intelligence brief has not been generated yet.</p>
                  </div>
                </div>
              )}

              {!loading && !error && report && (
                <>
                  {activeTab === 'claude' && (
                    <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap font-mono">
                      {report.full_report_md || (
                        [
                          report.section_go_no_go,
                          report.section_traffic_strategy,
                          report.section_competitive_pressure,
                        ].filter(Boolean).join('\n\n---\n\n') || 'No synthesis generated yet.'
                      )}
                    </div>
                  )}

                  {activeTab === 'research' && (
                    <div className="space-y-6 text-sm text-gray-300 leading-relaxed font-mono whitespace-pre-wrap">
                      {report.section_market_trends && (
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2">Market Trends</div>
                          <p>{report.section_market_trends}</p>
                        </div>
                      )}
                      {report.section_geo_opportunity && (
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2">Geo Opportunity</div>
                          <p>{report.section_geo_opportunity}</p>
                        </div>
                      )}
                      {report.section_audience_profile && (
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2">Audience Profile</div>
                          <p>{report.section_audience_profile}</p>
                        </div>
                      )}
                      {!report.section_market_trends && !report.section_geo_opportunity && !report.section_audience_profile && (
                        <p className="text-gray-600">No market research sections generated yet.</p>
                      )}
                    </div>
                  )}

                  {activeTab === 'studio' && (
                    <div className="space-y-6">
                      {projects.length > 0 ? (
                        <div className="space-y-4">
                          <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2">Active Projects</div>
                          {projects.map((p) => (
                            <a
                              key={p.id}
                              href={`/studio/${p.id}`}
                              className="block p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:border-primary/50 transition-all group"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-sm font-medium text-white group-hover:text-primary transition-colors">{p.name}</div>
                                  <div className="text-xs text-gray-500 mt-1 capitalize">{p.status} • {p.target_persona} Persona</div>
                                </div>
                                <div className="p-2 rounded-lg bg-white/5 group-hover:bg-primary/20 text-gray-400 group-hover:text-primary transition-all">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                  </svg>
                                </div>
                              </div>
                            </a>
                          ))}
                          <button
                            onClick={() => handleCreateProject('ogilvy', 'Premium OLED')}
                            className="w-full py-3 rounded-xl border border-dashed border-white/10 text-gray-500 text-xs font-medium hover:border-white/20 hover:text-gray-400 transition-all"
                          >
                            + Draft New Variant
                          </button>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <div className="w-16 h-16 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-primary/20">
                            <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                          </div>
                          <h3 className="text-lg font-medium text-white mb-2">Initialize Creative Studio</h3>
                          <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">
                            Transform this offer intelligence into a production-ready CPA campaign with AI-native assets.
                          </p>
                          <div className="grid grid-cols-2 gap-3 mb-6">
                            <button
                              onClick={() => handleCreateProject('ogilvy', 'Premium OLED')}
                              disabled={creatingProject}
                              className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-gray-300 hover:bg-white/10 transition-all"
                            >
                              David Ogilvy
                              <span className="block text-[9px] text-gray-500 font-normal">Storytelling</span>
                            </button>
                            <button
                              onClick={() => handleCreateProject('halbert', 'Direct Sales')}
                              disabled={creatingProject}
                              className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-gray-300 hover:bg-white/10 transition-all"
                            >
                              Gary Halbert
                              <span className="block text-[9px] text-gray-500 font-normal">Aggressive</span>
                            </button>
                          </div>
                          <button
                            onClick={() => handleCreateProject('ogilvy', 'Premium OLED')}
                            disabled={creatingProject}
                            className="w-full py-4 rounded-2xl bg-primary text-black font-bold uppercase tracking-widest text-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
                          >
                            {creatingProject ? 'Initializing...' : 'Start Studio Session'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'metadata' && (
                    <div className="space-y-3">
                      {[
                        { label: 'Score Total', value: report.score_total },
                        { label: 'Confidence Score', value: report.confidence_score },
                        { label: 'Payout', value: report.payout ? `$${report.payout}` : '—' },
                        { label: 'Status', value: report.status },
                        { label: 'Tier', value: `Tier ${report.tier}` },
                        {
                          label: 'Generated At',
                          value: report.generated_at
                            ? new Date(report.generated_at).toLocaleString()
                            : '—',
                        },
                      ].map(({ label, value }) => (
                        <div
                          key={label}
                          className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5"
                        >
                          <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">{label}</span>
                          <span className="text-sm text-white font-semibold tabular-nums">{value ?? '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
