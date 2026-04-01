'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Offer } from '@/types';

interface DeployModalProps {
  offer: Offer | null;
  onClose: () => void;
}

export default function DeployModal({ offer, onClose }: DeployModalProps) {
  const [deploying, setDeploying] = useState(false);

  const handleDeploy = async () => {
    setDeploying(true);
    try {
      const res = await fetch('/api/nexus/sync/full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_id: offer?.id }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Sync pipeline dispatched successfully.');
        onClose();
      } else {
        toast.error(data.error || 'Deploy failed. Please try again.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Connection error: ' + message);
    } finally {
      setDeploying(false);
    }
  };

  const rows = offer
    ? [
        { label: 'Offer Name', value: offer.name },
        { label: 'Tier', value: offer.tier ? `Tier ${offer.tier}` : '—' },
        { label: 'Payout', value: offer.payout != null ? `$${offer.payout}` : '—' },
        { label: 'Score', value: offer.score_total ?? '—' },
        { label: 'Keywords', value: offer.keyword_count ?? '—' },
        { label: 'Breakeven CPC', value: offer.breakeven_cpc != null ? `$${offer.breakeven_cpc}` : '—' },
      ]
    : [];

  return (
    <AnimatePresence>
      {offer && (
        <>
          {/* Backdrop */}
          <motion.div
            key="deploy-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={onClose}
          >
            {/* Modal */}
            <motion.div
              key="deploy-modal"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="w-full max-w-md bg-[#0a0a0f]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-primary fill-primary" />
                  <h2 className="text-sm font-bold text-white uppercase tracking-widest">Dispatch Sync Pipeline</h2>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close modal"
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Offer Summary */}
                <div className="rounded-xl bg-white/[0.03] border border-white/5 overflow-hidden">
                  {rows.map(({ label, value }, idx) => (
                    <div
                      key={label}
                      className={cn(
                        'flex items-center justify-between px-4 py-3',
                        idx < rows.length - 1 && 'border-b border-white/5'
                      )}
                    >
                      <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{label}</span>
                      <span className="text-sm text-white font-semibold tabular-nums">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Warning */}
                <div className="flex gap-3 p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                  <AlertTriangle size={16} className="text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-300/80 leading-relaxed">
                    This will queue the offer for full pipeline synchronization and operator storage. Review all settings before confirming.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={onClose}
                    disabled={deploying}
                    className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/[0.08] border border-white/10 text-sm font-bold text-gray-300 hover:text-white transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeploy}
                    disabled={deploying}
                    className="flex-1 py-3 rounded-xl bg-primary hover:bg-primary/90 text-sm font-bold text-white transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_25px_rgba(59,130,246,0.4)] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {deploying ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Deploying...
                      </>
                    ) : (
                      <>
                        <Zap size={14} className="fill-white" />
                        Confirm Dispatch
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
