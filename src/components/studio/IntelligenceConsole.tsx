'use client';

import React, { useEffect, useRef } from 'react';
import { useFunnelStore } from '@/components/studio/editor/funnelStore';
import { Terminal, X, Cpu, Loader2, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function IntelligenceConsole() {
  const { isGenerating, intelligenceLogs, setGenerating } = useFunnelStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [intelligenceLogs]);

  if (!isGenerating && intelligenceLogs.length === 0) return null;

  return (
    <AnimatePresence>
      {(isGenerating || intelligenceLogs.length > 0) && (
        <motion.div 
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="fixed bottom-8 right-96 z-[100] w-[400px] bg-black/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/20 text-primary">
                <Cpu className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-white">Project Intelligence Console</span>
            </div>
            <div className="flex items-center gap-2">
               {isGenerating && <Loader2 className="w-3 h-3 text-primary animate-spin" />}
               <button 
                onClick={() => useFunnelStore.getState().clearIntelligenceLogs()}
                className="p-1 hover:bg-white/5 rounded-md text-gray-500"
               >
                 <X className="w-4 h-4" />
               </button>
            </div>
          </div>

          {/* Log Window */}
          <div 
            ref={scrollRef}
            className="h-64 overflow-y-auto p-4 font-mono text-[10px] space-y-2 last:pb-8"
          >
            {intelligenceLogs.map((log) => (
              <div key={log.id} className="flex gap-3 items-start animate-in fade-in slide-in-from-left-2 duration-300">
                <span className="text-gray-600 shrink-0">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}]</span>
                <div className="flex gap-2">
                  {log.level === 'ai' && <Sparkles className="w-3 h-3 text-primary mt-0.5" />}
                  {log.level === 'success' && <CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5" />}
                  {log.level === 'error' && <AlertCircle className="w-3 h-3 text-red-500 mt-0.5" />}
                  <span className={`
                    ${log.level === 'ai' ? 'text-primary' : ''}
                    ${log.level === 'success' ? 'text-emerald-400' : ''}
                    ${log.level === 'error' ? 'text-red-400' : ''}
                    ${log.level === 'warn' ? 'text-amber-400' : ''}
                    ${log.level === 'info' ? 'text-gray-300' : ''}
                  `}>
                    {log.message}
                  </span>
                </div>
              </div>
            ))}
            {isGenerating && (
              <div className="flex gap-3 items-center text-primary animate-pulse">
                <span className="text-gray-600">[WAIT]</span>
                <span>Awaiting AI Response packet...</span>
              </div>
            )}
          </div>

          {/* Footer Status */}
          <div className="px-4 py-2 border-t border-white/10 bg-black/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${isGenerating ? 'bg-primary animate-pulse' : 'bg-gray-600'}`} />
              <span className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">
                {isGenerating ? 'Processing Model Chain' : 'Engine Idle'}
              </span>
            </div>
            <span className="text-[9px] text-gray-700 font-mono italic">nexus.os / intel_v2.1</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
