'use strict';
const { db } = require('./db');
const BlueprintService = require('./BlueprintService');
const AssetService = require('./AssetService');

/**
 * NEXUS Studio Service
 * 
 * Manages the lifecycle of Creative Projects, Blueprints, and Funnels.
 */

class StudioService {
    
    /**
     * Create a new Creative Project
     */
    static async createProject(offerId, name, persona, vibe, alphaKeywords) {
        try {
            const result = await db.run(`
                INSERT INTO studio_projects (offer_id, name, target_persona, target_vibe, alpha_keywords, status)
                VALUES ($1, $2, $3, $4, $5, 'draft')
                RETURNING *
            `, [offerId, name, persona, vibe, alphaKeywords]);
            
            const project = result.rows[0];
            
            // Trigger initial blueprint generation in background (fire and forget for now)
            this.generateBlueprint(project.id).catch(err => {
                console.error(`[Studio] Background blueprint failed: ${err.message}`);
            });
            
            return project;
        } catch (err) {
            console.error(`[Studio] Failed to create project: ${err.message}`);
            throw err;
        }
    }

    /**
     * Trigger AI Blueprint Generation
     */
    static async generateBlueprint(projectId) {
        console.log(`[Studio] Requesting blueprint for project: ${projectId}`);
        return await BlueprintService.generate(projectId);
    }

    /**
     * Generate initial funnel draft from blueprint
     */
    static async generateInitialDraft(projectId) {
        const blueprint = await db.get('SELECT * FROM studio_blueprints WHERE project_id = $1', [projectId]);
        if (!blueprint) throw new Error('No blueprint found to draft from');

        // Initial layout structure
        const layoutData = {
            sections: [
                { id: 'sec-1', type: 'hero', content: { headline: blueprint.results.copy_matrix?.headline || 'High Conversion Offer', subheadline: blueprint.results.copy_matrix?.subheadline || '' } },
                { id: 'sec-2', type: 'social_proof', content: { text: 'Trusted by experts.' } },
                { id: 'sec-3', type: 'features', content: { title: 'Core Benefits' } },
                { id: 'sec-4', type: 'cta', content: { buttonText: 'Get Started Now' } }
            ]
        };

        const result = await db.run(`
            INSERT INTO studio_funnels (project_id, layout_data)
            VALUES ($1, $2)
            ON CONFLICT (project_id) DO UPDATE SET layout_data = EXCLUDED.layout_data, updated_at = NOW()
            RETURNING *
        `, [projectId, JSON.stringify(layoutData)]);

        return result.rows[0];
    }

    /**
     * Generate a batch of assets for a project
     */
    static async generateAssets(projectId, vibe = 'professional') {
        const assets = await AssetService.generateBatch(projectId, 10, vibe);
        return assets;
    }
}

module.exports = { StudioService };
