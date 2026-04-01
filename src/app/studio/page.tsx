'use client';

import React, { useEffect, useState } from 'react';
import { Wand2, ArrowLeft, Plus, Clock, ChevronRight, AlertTriangle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import GlassCard from '@/components/GlassCard';
import { cn } from '@/lib/utils';

interface StudioProject {
  id: string;
  offer_id: string;
  name: string;
  status: string;
  target_persona: string;
  target_vibe: string | null;
  predicted_ctr: number | null;
  actual_ctr: number | null;
  total_leads: number;
  created_at: string;
  updated_at: string;
}

interface CreateForm {
  offerId: string;
  name: string;
  persona: string;
  vibe: string;
  alphaKeywords: string;
}

const STATUS_STYLE: Record<string, string> = {
  draft:            'bg-white/5 border-white/10 text-gray-400',
  strategy_ready:   'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  simulating:       'bg-amber-500/10 border-amber-500/20 text-amber-400',
  review_pending:   'bg-blue-500/10 border-blue-500/20 text-blue-400',
  approved:         'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  deployed:         'bg-primary/10 border-primary/20 text-primary',
  archived:         'bg-white/5 border-white/10 text-gray-600',
};

const PERSONAS = ['ogilvy', 'halbert', 'schwartz', 'hopkins', 'custom'];

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export default function StudioPage() {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateForm>({
    offerId: '', name: '', persona: 'ogilvy', vibe: '', alphaKeywords: ''
  });

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/nexus/studio/projects/all');
      const json = await res.json();
      if (json.success) {
        setProjects(json.data);
      } else {
        setError(json.error || 'Failed to load studio projects');
      }
    } catch {
      setError('Connection aborted');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProjects(); }, []);

  const handleCreate = async () => {
    if (!form.offerId.trim() || !form.name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/nexus/studio/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: form.offerId.trim(),
          name: form.name.trim(),
          persona: form.persona,
          vibe: form.vibe.trim() || null,
          alphaKeywords: form.alphaKeywords.split(',').map(k => k.trim()).filter(Boolean),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowCreate(false);
        setForm({ offerId: '', name: '', persona: 'ogilvy', vibe: '', alphaKeywords: '' });
        fetchProjects();
      } else {
        setError(json.error || 'Failed to create project');
      }
    } catch {
      setError('Create request failed');
    } finally {
      setCreating(false);
    }
  };

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
              <Wand2 size={28} className="text-primary" />
              Creative Studio
            </h1>
            <p className="text-gray-500 font-medium mt-1">
              AI-generated funnel blueprints — Direct response strategy + layout drafts.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-black font-bold text-xs uppercase tracking-widest hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} />
            New Project
          </button>
        </div>
      </header>

      {showCreate && (
        <GlassCard className="mb-8 border-primary/20">
          <div className="text-xs font-bold uppercase tracking-widest text-primary mb-5">New Studio Project</div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5 block">Offer ID (UUID)</label>
              <input
                type="text"
                value={form.offerId}
                onChange={e => setForm(f => ({ ...f, offerId: e.target.value }))}
                placeholder="e.g. 3f2e1a..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-primary/40"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5 block">Project Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Aggressive Tabloid v1"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-primary/40"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5 block">Copywriter Persona</label>
              <select
                value={form.persona}
                onChange={e => setForm(f => ({ ...f, persona: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/40"
              >
                {PERSONAS.map(p => <option key={p} value={p} className="bg-black">{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5 block">Vibe</label>
              <input
                type="text"
                value={form.vibe}
                onChange={e => setForm(f => ({ ...f, vibe: e.target.value }))}
                placeholder="e.g. Premium OLED, Aggressive Tabloid"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-primary/40"
              />
            </div>
          </div>
          <div className="mb-5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5 block">Alpha Keywords (comma-separated)</label>
            <input
              type="text"
              value={form.alphaKeywords}
              onChange={e => setForm(f => ({ ...f, alphaKeywords: e.target.value }))}
              placeholder="buy insurance online, cheap auto insurance, ..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-primary/40"
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !form.offerId.trim() || !form.name.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-black font-bold text-xs uppercase tracking-widest hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
              {creating ? 'Generating...' : 'Create & Generate Blueprint'}
            </button>
          </div>
        </GlassCard>
      )}

      {error && (
        <GlassCard className="flex items-center gap-3 mb-8 border-red-500/20 bg-red-500/5 text-red-400">
          <AlertTriangle size={16} />
          <span className="text-sm font-medium">{error}</span>
        </GlassCard>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={20} className="text-primary animate-spin mr-3" />
          <span className="text-gray-500 text-xs font-bold uppercase tracking-widest">Loading projects...</span>
        </div>
      ) : (
        <GlassCard noPadding className="border-white/5">
          <div className="divide-y divide-white/5">
            {projects.map((project, i) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i * 0.04, 0.4) }}
              >
                <Link
                  href={`/studio/${project.id}`}
                  className="flex items-center gap-5 px-6 py-4 hover:bg-white/[0.02] transition-colors group"
                >
                  <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-bold text-gray-600 tabular-nums shrink-0">
                    {i + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm group-hover:text-primary transition-colors truncate">
                      {project.name}
                    </div>
                    <div className="text-[10px] text-gray-600 font-medium uppercase tracking-tighter mt-0.5">
                      {project.target_persona}{project.target_vibe ? ` · ${project.target_vibe}` : ''}
                    </div>
                  </div>

                  <span className={cn(
                    'px-2.5 py-1 rounded-full text-[9px] font-bold uppercase border shrink-0',
                    STATUS_STYLE[project.status] ?? 'bg-white/5 border-white/10 text-gray-400'
                  )}>
                    {project.status.replace('_', ' ')}
                  </span>

                  <div className="text-right shrink-0 w-20">
                    <div className="text-sm font-bold text-emerald-400 tabular-nums">{project.total_leads}</div>
                    <div className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Leads</div>
                  </div>

                  <div className="text-[10px] text-gray-600 font-mono flex items-center gap-1 shrink-0 w-20 justify-end">
                    <Clock size={10} />
                    {timeAgo(project.updated_at)}
                  </div>

                  <ChevronRight size={14} className="text-gray-700 group-hover:text-primary transition-colors shrink-0" />
                </Link>
              </motion.div>
            ))}

            {projects.length === 0 && (
              <div className="flex flex-col items-center gap-4 text-gray-600 py-20 text-center">
                <Wand2 size={32} className="opacity-30" />
                <p className="text-sm font-medium">No studio projects yet.</p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="text-xs text-primary hover:underline"
                >
                  Create your first project
                </button>
              </div>
            )}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
