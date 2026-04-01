/**
 * Canonical type definitions for the funnel page builder.
 * All editor components should import from here — do NOT define
 * duplicate Section / Column / Block types elsewhere.
 */

// ---------------------------------------------------------------------------
// Block
// ---------------------------------------------------------------------------

export type BlockType =
    | 'text'
    | 'image'
    | 'button'
    | 'form'
    | 'video'
    | 'code'
    | 'map'
    | 'testimonial'
    | 'calendar'
    | 'ecommerce'
    | 'team'
    | 'chart'
    | 'audio'
    | 'countdown'
    | 'social'
    | 'spacer'
    | 'container'
    | 'grid'
    | 'tabs'
    | 'accordion'
    | 'woocommerce-product'
    | 'shopify-buy-button';

export interface BlockSettings {
    padding: string;
    margin: string;
    backgroundColor: string;
    borderRadius: string;
    animation?: string;
}

export interface Block {
    id: string;
    type: BlockType;
    content: Record<string, unknown>;
    settings: BlockSettings;
    children?: Block[];
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

export interface ColumnSettings {
    padding: string;
    backgroundColor: string;
    verticalAlign: 'top' | 'middle' | 'bottom';
}

export interface Column {
    id: string;
    type: 'column';
    width: number; // percentage
    blocks: Block[];
    settings: ColumnSettings;
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export type SectionLayout =
    | 'single'
    | 'two-column'
    | 'three-column'
    | 'two-column-66-33'
    | 'two-column-33-66'
    | 'four-column'
    | 'custom';

export interface SectionSettings {
    backgroundColor: string;
    padding: string;
    margin: string;
    minHeight: string;
    fullWidth: boolean;
    backgroundImage?: string;
}

export interface Section {
    id: string;
    type: 'section';
    layout: SectionLayout;
    columns: Column[];
    settings: SectionSettings;
}

// ---------------------------------------------------------------------------
// Funnel
// ---------------------------------------------------------------------------

export interface FunnelSettings {
    backgroundColor: string;
    maxWidth: string;
    fontFamily?: string;
}

export interface Funnel {
    id?: number;
    name: string;
    description?: string;
    content: {
        sections: Section[];
    };
    settings: FunnelSettings;
    status: 'draft' | 'published' | 'archived';
    is_published: boolean;
}

// ---------------------------------------------------------------------------
// Intelligence / Blueprint
// ---------------------------------------------------------------------------

export interface IntelligenceLog {
    id: string;
    timestamp: string;
    level: 'info' | 'warn' | 'success' | 'error' | 'ai';
    message: string;
}

export interface Blueprint {
    id?: number;
    project_id: number;
    results: {
        empathy_map?: {
            pain_points: string[];
            desires: string[];
            fears: string[];
        };
        copy_matrix?: {
            headline: string;
            subheadline: string;
            hooks: string[];
            value_props: string[];
        };
        funnel_structure?: Array<{
            section: string;
            purpose: string;
            content_vibe: string;
        }>;
    };
    model_version: string;
    updated_at: string;
}
