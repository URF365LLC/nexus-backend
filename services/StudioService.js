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
     * Update project status
     */
    static async updateStatus(projectId, status) {
        await db.run('UPDATE studio_projects SET status = $1, updated_at = NOW() WHERE id = $2', [status, projectId]);
    }

    /**
     * Trigger AI Blueprint Generation
     */
    static async generateBlueprint(projectId) {
        console.info(`[Studio Engine] Initiating strategy synthesis for: ${projectId}`);
        try {
            await this.updateStatus(projectId, 'generating');
            const blueprint = await BlueprintService.generate(projectId);
            await this.updateStatus(projectId, 'ready');
            return blueprint;
        } catch (err) {
            console.error(`[Studio Engine] Strategy synthesis failed: ${err.message}`);
            await this.updateStatus(projectId, 'failed');
            throw err;
        }
    }

    /**
     * Generate initial funnel draft from blueprint
     */
    static async generateInitialDraft(projectId) {
        const blueprint = await db.get('SELECT * FROM studio_blueprints WHERE project_id = $1', [projectId]);
        if (!blueprint) throw new Error('No blueprint found to draft from. Please generate strategy first.');

        const results = blueprint.results || {};
        const copyMatrix = results.copy_matrix || {};

        // Initial layout structure with robust fallbacks
        const layoutData = {
            sections: [
                { 
                    id: `sec-${Date.now()}-1`, 
                    type: 'hero', 
                    content: { 
                        headline: copyMatrix.headline || 'High-Fidelity Market Solution', 
                        subheadline: copyMatrix.subheadline || 'Intelligence-driven deployment via Nexus Studio.' 
                    } 
                },
                { 
                    id: `sec-${Date.now()}-2`, 
                    type: 'social_proof', 
                    content: { text: 'Engineered for maximum conversion efficiency.' } 
                },
                { 
                    id: `sec-${Date.now()}-3`, 
                    type: 'features', 
                    content: { title: 'Strategic Advantages' } 
                },
                { 
                    id: `sec-${Date.now()}-4`, 
                    type: 'cta', 
                    content: { buttonText: 'Deploy Now' } 
                }
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
