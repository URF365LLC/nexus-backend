'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import LayoutBuilder from '@/components/studio/editor/LayoutBuilder';
import PropertiesPanel from '@/components/studio/editor/PropertiesPanel';
import ContentBlockLibrary from '@/components/studio/editor/ContentBlockLibrary';
import { useFunnelStore } from '@/components/studio/editor/funnelStore';
import { 
  Save,
  Play,
  Image as ImageIcon,
  Cpu,
  LayoutPanelTop,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  Sparkles,
  Settings
} from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import IntelligenceConsole from '@/components/studio/IntelligenceConsole';

export default function StudioWorkbench() {
  const { id: projectId } = useParams();
  const router = useRouter();
  const { 
    funnel,
    setSections, 
    selectedSectionId, 
    selectedColumnId,
    selectedBlockId,
    selectedDevice,
    selectSection,
    selectColumn,
    selectBlock,
    selectDevice,
    updateBlock,
    updateSection,
    updateColumn,
    addBlock,
    deleteBlock,
    generateBlueprint,
    isGenerating,
    blueprint,
  } = useFunnelStore();

  const sections = funnel.content.sections;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectData, setProjectData] = useState<any>(null);
  const [activeRightTab, setActiveRightTab] = useState<'properties' | 'assets' | 'simulation'>('properties');

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/nexus/studio/projects/detail/${projectId}`);
        const json = await res.json();
        if (json.success) {
          setProjectData(json.data);
          if (json.data.funnel?.layout_data?.children) {
             // Mapping basic JSON to OpenFunnels sections if needed, 
             // but here we assuming layout_data matches the store structure.
             setSections(json.data.funnel.layout_data.sections || []);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [projectId, setSections]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/nexus/studio/projects/${projectId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layoutData: { sections } })
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#050505]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-500 uppercase tracking-widest font-medium">Initializing Studio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-white overflow-hidden ml-[var(--sidebar-w)]">
      {/* Top Header */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-black/40 backdrop-blur-xl z-50">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => router.back()}
            className="p-2 hover:bg-white/5 rounded-lg text-gray-400"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">{projectData?.project?.name}</h1>
            <div className="flex items-center space-x-2 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Studio Active</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 mr-4">
             <button className="px-4 py-1.5 rounded-lg bg-primary text-black text-xs font-bold flex items-center gap-2">
                <LayoutPanelTop className="w-4 h-4" /> Desktop
             </button>
             <button className="px-4 py-1.5 rounded-lg text-gray-500 text-xs font-bold hover:text-white transition-colors">
                Mobile
             </button>
          </div>
          
          <button 
            onClick={() => generateBlueprint(projectId as string)}
            disabled={isGenerating}
            className="flex items-center space-x-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-xl hover:bg-primary/20 transition-all text-sm font-bold text-primary group"
          >
            <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-pulse' : 'group-hover:rotate-12 transition-transform'}`} />
            <span>{isGenerating ? 'AI Thinking...' : 'Generate Strategy'}</span>
          </button>
          
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center space-x-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-sm font-medium text-gray-300"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{saving ? 'Saving...' : 'Save Draft'}</span>
          </button>
          
          <button className="flex items-center space-x-2 px-5 py-2 bg-primary text-black rounded-xl hover:bg-primary/90 transition-all text-sm font-bold">
            <Play className="w-4 h-4 fill-current" />
            <span>Deploy</span>
          </button>
        </div>
      </header>

      <IntelligenceConsole />

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Sidebar: Components & Blueprint */}
        <aside className="w-80 border-r border-white/10 flex flex-col bg-black/20">
          <div className="p-6 border-b border-white/10">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Blueprint Strategy</h3>
            <GlassCard className={`p-4 border-primary/20 transition-all ${isGenerating ? 'animate-pulse opacity-50' : 'bg-primary/5'}`}>
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-primary/20 text-primary">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white capitalize">{projectData?.project?.target_persona || 'Persona'} Strategy</div>
                  <p className="text-[10px] text-gray-400 mt-1 line-clamp-3">
                    {blueprint?.results.copy_matrix?.headline || projectData?.blueprint?.angle || 'No strategy generated yet. Use the Intelligence Engine to start.'}
                  </p>
                </div>
              </div>
            </GlassCard>
            
            {blueprint?.results.empathy_map && (
              <div className="mt-6 space-y-4">
                 <h4 className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Pain Points</h4>
                 <div className="space-y-2">
                   {blueprint.results.empathy_map.pain_points.slice(0, 3).map((p, i) => (
                     <div key={i} className="p-2 rounded-lg bg-white/5 border border-white/5 text-[9px] text-gray-400 italic">"{p}"</div>
                   ))}
                 </div>
              </div>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            <ContentBlockLibrary />
          </div>
        </aside>

        {/* Center: Canvas */}
        <main className="flex-1 overflow-hidden relative">
          <div className="absolute inset-0 overflow-y-auto bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px]">
             <div className="max-w-5xl mx-auto py-12 px-8 min-h-full">
                <LayoutBuilder 
                  sections={sections}
                  onSectionsChange={setSections}
                  selectedSectionId={selectedSectionId}
                  onSelectSection={selectSection}
                  selectedColumnId={selectedColumnId}
                  onSelectColumn={selectColumn}
                  selectedBlockId={selectedBlockId}
                  onSelectBlock={selectBlock}
                  onBlockUpdate={(blockId, updates) => {
                     // In a real editor, we'd need use store.findBlockLocation(blockId)
                     // For now, assume current selection if applicable or handle globally
                     if (selectedBlockId === blockId && selectedSectionId && selectedColumnId) {
                        updateBlock(selectedSectionId, selectedColumnId, blockId, updates);
                     }
                  }}
                  onBlockAdd={addBlock}
                  onBlockDelete={deleteBlock}
                />
             </div>
          </div>
        </main>

        {/* Right Sidebar: Assets & Properties */}
        <aside className="w-96 border-l border-white/10 flex flex-col bg-black/20">
          <div className="flex border-b border-white/10">
            <button 
              onClick={() => setActiveRightTab('properties')}
              className={`flex-1 py-4 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 ${activeRightTab === 'properties' ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}
            >
              Properties
            </button>
            <button 
              onClick={() => setActiveRightTab('assets')}
              className={`flex-1 py-4 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 ${activeRightTab === 'assets' ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}
            >
              Asset Factory
            </button>
            <button 
              onClick={() => setActiveRightTab('simulation')}
              className={`flex-1 py-4 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 ${activeRightTab === 'simulation' ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}
            >
              Digital Twin
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeRightTab === 'properties' && (
              <div className="p-6">
                {selectedSectionId || selectedBlockId ? (
                  <PropertiesPanel 
                    selectedSection={sections.find(s => s.id === selectedSectionId) || null}
                    selectedColumn={sections.find(s => s.id === selectedSectionId)?.columns.find(c => c.id === selectedColumnId) || null}
                    selectedBlock={selectedBlockId ? (sections.find(s => s.id === selectedSectionId)?.columns.find(c => c.id === selectedColumnId)?.blocks.find(b => b.id === selectedBlockId) || null) : null}
                    selectedDevice={selectedDevice}
                    onSectionUpdate={updateSection}
                    onColumnUpdate={updateColumn}
                    onBlockUpdate={(blockId, updates) => {
                       if (selectedSectionId && selectedColumnId) {
                          updateBlock(selectedSectionId, selectedColumnId, blockId, updates);
                       }
                    }}
                    onDeviceChange={selectDevice}
                  />
                ) : (
                  <div className="text-center py-20">
                    <Settings className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                    <p className="text-sm text-gray-500">Select an element to edit properties</p>
                  </div>
                )}
              </div>
            )}

            {activeRightTab === 'assets' && (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between mb-2">
                   <h3 className="text-xs font-bold text-white uppercase tracking-widest">Persona Assets</h3>
                   <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded border border-emerald-500/20 font-bold uppercase tracking-widest">{projectData?.assets?.length || 5} Ready</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(projectData?.assets || [
                    { content_url: 'studio_hero_professional_1775059114222.png', asset_type: 'Hero' },
                    { content_url: 'studio_benefit_interface_1775059129457.png', asset_type: 'Benefit' },
                    { content_url: 'studio_lifestyle_success_1775059147465.png', asset_type: 'Lifestyle' },
                    { content_url: 'studio_authority_team_1775059164239.png', asset_type: 'Authority' },
                    { content_url: 'studio_social_proof_conference_1775059179056.png', asset_type: 'Social Proof' },
                    { content_url: 'studio_security_shield_1775059276562.png', asset_type: 'Trust' },
                    { content_url: 'studio_growth_chart_1775059291740.png', asset_type: 'Results' },
                    { content_url: 'studio_support_team_1775059307734.png', asset_type: 'Team' },
                    { content_url: 'studio_comparison_clean_1775059321686.png', asset_type: 'Comparison' },
                    { content_url: 'studio_cta_button_1775059338147.png', asset_type: 'CTA' }
                  ]).map((asset: any, i: number) => (
                    <div key={i} className="group relative overflow-hidden rounded-xl border border-white/10 aspect-video bg-black/40">
                       <img 
                         src={`/api/nexus/studio/assets/${asset.content_url}`} 
                         alt={asset.asset_type}
                         className="w-full h-full object-cover transition-transform group-hover:scale-110"
                         onError={(e) => {
                            // Fallback if API serves files from different path
                            e.currentTarget.src = 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=400';
                         }}
                       />
                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button className="px-3 py-1 bg-primary text-black text-[10px] font-bold rounded uppercase tracking-widest">Use {asset.asset_type}</button>
                       </div>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={async () => {
                    await fetch(`/api/nexus/studio/projects/${projectId}/assets`, { 
                      method: 'POST', 
                      headers: {'Content-Type': 'application/json'},
                      body: JSON.stringify({ vibe: 'professional_saas' })
                    });
                    // Refresh project data logic here
                  }}
                  className="w-full py-4 border border-dashed border-primary/40 bg-primary/5 rounded-2xl text-xs text-primary font-bold hover:bg-primary/10 transition-all uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-3 h-3" />
                  Produce Batch 2 (SaaS Professional Experiment)
                </button>
              </div>
            )}

            {activeRightTab === 'simulation' && (
              <div className="p-6">
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
                  <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
                    <Cpu className="w-8 h-8 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">MiroFish Simulation</h3>
                  <p className="text-xs text-gray-500 mb-6 font-mono leading-relaxed">
                    Pre-launch testing using 1,000 synthetic agent personas matching your target demographics.
                  </p>
                  <button className="w-full py-4 rounded-xl bg-blue-600 text-white font-bold uppercase tracking-widest text-[10px] hover:bg-blue-500 transition-all flex items-center justify-center gap-2">
                    <Play className="w-3 h-3 fill-current" />
                    Run High-Fidelity Sim
                  </button>
                </div>
                
                <div className="mt-8 space-y-4">
                   <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Previous Predictions</h4>
                   {[1, 2].map(i => (
                     <div key={i} className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="flex items-center justify-between mb-2">
                           <span className="text-xs font-medium text-white">Sim v1.{i}</span>
                           <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                           <div className="text-gray-500">Predicted CTR: <span className="text-white font-bold tabular-nums">4.2%</span></div>
                           <div className="text-gray-500">Conv Prob: <span className="text-white font-bold tabular-nums">0.8%</span></div>
                        </div>
                     </div>
                   ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
