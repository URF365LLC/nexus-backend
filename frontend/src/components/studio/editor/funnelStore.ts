import { create } from 'zustand';
import { produce, current } from 'immer';
import type {
    Funnel,
    Section,
    Column,
    Block,
    FunnelSettings,
    Blueprint,
    IntelligenceLog,
} from '@/components/studio/editor/types';

// Re-export canonical types.
export type { Funnel, Section, Column, Block, Blueprint, IntelligenceLog } from '@/components/studio/editor/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_HISTORY = 50;

function generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getDefaultFunnel(): Funnel {
    return {
        name: 'Untitled Funnel',
        description: '',
        content: { sections: [] },
        settings: {
            backgroundColor: '#ffffff',
            maxWidth: '1200px',
            fontFamily: 'Inter, sans-serif',
        },
        status: 'draft',
        is_published: false,
    };
}

function snapshot(funnel: Funnel): Funnel {
    return JSON.parse(JSON.stringify(funnel));
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface FunnelStore {
    funnel: Funnel;
    selectedSectionId: string | null;
    selectedColumnId: string | null;
    selectedBlockId: string | null;
    selectedDevice: 'desktop' | 'tablet' | 'mobile';

    isDirty: boolean;
    isSaving: boolean;
    isGenerating: boolean;
    draggedBlock: Block | null;
    blueprint: Blueprint | null;
    intelligenceLogs: IntelligenceLog[];

    history: Funnel[];
    historyIndex: number;

    setFunnel: (funnel: Funnel) => void;
    updateFunnelName: (name: string) => void;
    updateFunnelSettings: (settings: Partial<FunnelSettings>) => void;
    setSections: (sections: Section[]) => void;

    addSection: (section: Section) => void;
    updateSection: (sectionId: string, updates: Partial<Section>) => void;
    deleteSection: (sectionId: string) => void;

    updateColumn: (sectionId: string, columnId: string, updates: Partial<Column>) => void;

    addBlock: (sectionId: string, columnId: string, block: Block, index?: number) => void;
    updateBlock: (sectionId: string, columnId: string, blockId: string, updates: Partial<Block>) => void;
    deleteBlock: (sectionId: string, columnId: string, blockId: string) => void;

    selectSection: (sectionId: string | null) => void;
    selectColumn: (columnId: string | null) => void;
    selectBlock: (blockId: string | null) => void;
    selectDevice: (device: 'desktop' | 'tablet' | 'mobile') => void;

    setSaving: (saving: boolean) => void;
    setGenerating: (generating: boolean) => void;
    setBlueprint: (blueprint: Blueprint | null) => void;
    addIntelligenceLog: (message: string, level?: IntelligenceLog['level']) => void;
    clearIntelligenceLogs: () => void;
    generateBlueprint: (projectId: string) => Promise<void>;
    undo: () => void;
    redo: () => void;
}

// ---------------------------------------------------------------------------
// Immer helper
// ---------------------------------------------------------------------------

function immerSet(fn: (draft: FunnelStore) => void): (state: FunnelStore) => Partial<FunnelStore> {
    return (state) => produce(state, fn) as Partial<FunnelStore>;
}

function pushHistory(draft: FunnelStore) {
    const snap = snapshot(draft.funnel);
    draft.history = draft.history.slice(0, draft.historyIndex + 1);
    draft.history.push(snap);
    if (draft.history.length > MAX_HISTORY) {
        draft.history = draft.history.slice(-MAX_HISTORY);
    }
    draft.historyIndex = draft.history.length - 1;
    draft.isDirty = true;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useFunnelStore = create<FunnelStore>()((set, get) => ({
    funnel: getDefaultFunnel(),
    selectedSectionId: null,
    selectedColumnId: null,
    selectedBlockId: null,
    selectedDevice: 'desktop',
    isDirty: false,
    isSaving: false,
    isGenerating: false,
    history: [getDefaultFunnel()],
    historyIndex: 0,
    draggedBlock: null,
    blueprint: null,
    intelligenceLogs: [],

    setFunnel: (funnel) => set({ funnel, isDirty: false }),
    updateFunnelName: (name) => set(immerSet((draft) => { pushHistory(draft); draft.funnel.name = name; })),
    updateFunnelSettings: (settings) => set(immerSet((draft) => { pushHistory(draft); Object.assign(draft.funnel.settings, settings); })),
    setSections: (sections) => set(immerSet((draft) => { pushHistory(draft); draft.funnel.content.sections = sections; })),

    addSection: (section) => set(immerSet((draft) => { pushHistory(draft); draft.funnel.content.sections.push(section); })),
    updateSection: (sectionId, updates) => set(immerSet((draft) => {
        const s = draft.funnel.content.sections.find(x => x.id === sectionId);
        if (s) Object.assign(s, updates);
    })),
    deleteSection: (sectionId) => set(immerSet((draft) => {
        draft.funnel.content.sections = draft.funnel.content.sections.filter(x => x.id !== sectionId);
    })),

    updateColumn: (sectionId, columnId, updates) => set(immerSet((draft) => {
        const s = draft.funnel.content.sections.find(x => x.id === sectionId);
        const c = s?.columns.find(x => x.id === columnId);
        if (c) Object.assign(c, updates);
    })),

    addBlock: (sectionId, columnId, block, index) => set(immerSet((draft) => {
        const s = draft.funnel.content.sections.find(x => x.id === sectionId);
        const c = s?.columns.find(x => x.id === columnId);
        if (c) {
            if (index !== undefined) c.blocks.splice(index, 0, block);
            else c.blocks.push(block);
        }
    })),
    updateBlock: (sectionId, columnId, blockId, updates) => set(immerSet((draft) => {
        const s = draft.funnel.content.sections.find(x => x.id === sectionId);
        const c = s?.columns.find(x => x.id === columnId);
        const b = c?.blocks.find(x => x.id === blockId);
        if (b) Object.assign(b, updates);
    })),
    deleteBlock: (sectionId, columnId, blockId) => set(immerSet((draft) => {
        const s = draft.funnel.content.sections.find(x => x.id === sectionId);
        const c = s?.columns.find(x => x.id === columnId);
        if (c) c.blocks = c.blocks.filter(x => x.id !== blockId);
    })),

    selectSection: (id) => set({ selectedSectionId: id, selectedColumnId: null, selectedBlockId: null }),
    selectColumn: (id) => set({ selectedColumnId: id, selectedBlockId: null }),
    selectBlock: (id) => set({ selectedBlockId: id }),
    selectDevice: (device) => set({ selectedDevice: device }),

    setSaving: (saving) => set({ isSaving: saving }),
    setGenerating: (generating) => set({ isGenerating: generating }),
    setBlueprint: (blueprint) => set({ blueprint }),
    addIntelligenceLog: (message, level = 'info') => set(immerSet((draft) => {
        draft.intelligenceLogs.push({ id: Math.random().toString(36).slice(2), timestamp: new Date().toISOString(), level, message });
        if (draft.intelligenceLogs.length > 50) draft.intelligenceLogs.shift();
    })),
    clearIntelligenceLogs: () => set({ intelligenceLogs: [] }),

    generateBlueprint: async (projectId) => {
        const { setGenerating, addIntelligenceLog, setBlueprint } = get();
        setGenerating(true);
        addIntelligenceLog('Initializing Creative Studio Intelligence Engine...', 'info');
        try {
            addIntelligenceLog('Establishing connection to Claude 3.5 Sonnet...', 'ai');
            const res = await fetch(`http://localhost:3001/api/nexus/studio/projects/${projectId}/generate`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                addIntelligenceLog('Strategy generation complete. Mapping copy assets...', 'success');
                setBlueprint(data.data);
            } else throw new Error(data.error);
        } catch (err: any) {
            addIntelligenceLog(`Generation failed: ${err.message}`, 'error');
        } finally {
            setGenerating(false);
        }
    },

    undo: () => {
        const { history, historyIndex } = get();
        if (historyIndex > 0) {
            set({ funnel: snapshot(history[historyIndex - 1]), historyIndex: historyIndex - 1 });
        }
    },
    redo: () => {
        const { history, historyIndex } = get();
        if (historyIndex < history.length - 1) {
            set({ funnel: snapshot(history[historyIndex + 1]), historyIndex: historyIndex + 1 });
        }
    },
}));
