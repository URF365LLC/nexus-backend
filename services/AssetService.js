'use strict';
const { db } = require('./db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * NEXUS Asset Service
 * 
 * Orchestrates the production of visual assets (images, icons, etc.)
 * for Studio projects using Gemini & Image Gen models.
 */

class AssetService {
    
    constructor() {
        if (process.env.GEMINI_API_KEY) {
            this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        }
    }

    /**
     * Generate a batch of assets for a project
     */
    async generateBatch(projectId, count = 15, vibe = 'professional') {
        console.log(`[AssetService] Starting Batch Production for Project: ${projectId} | Vibe: ${vibe}`);
        
        // 1. Get Blueprint Visual Strategy
        const blueprint = await db.get('SELECT * FROM studio_blueprints WHERE project_id = $1', [projectId]);
        if (!blueprint) throw new Error('No blueprint found for asset generation');
        
        const strategy = blueprint.results.visual_strategy || [];
        
        // 2. Logic to generate pixels (Simplified for Mock/Automation)
        // In a real system, this would call a model like 'imagen-3.0-generate-001'
        const assets = [];
        
        for (let i = 0; i < Math.min(count, strategy.length); i++) {
            const prompt = strategy[i];
            const assetType = this.inferAssetType(prompt);
            
            // Generate a filename / URL (In this studio env, we'll store the prompt 
            // and assuming the worker/subagent generates the actual pixels).
            const filename = `asset_${projectId}_${i}_${Date.now()}.png`;
            
            assets.push({
                project_id: projectId,
                asset_type: assetType,
                content_url: filename,
                prompt: prompt,
                vibe: vibe,
                status: 'pending'
            });
        }

        // 3. Persist to DB
        for (const asset of assets) {
            await db.run(`
                INSERT INTO studio_assets (project_id, asset_type, content_url, prompt, vibe, status)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [asset.project_id, asset.asset_type, asset.content_url, asset.prompt, asset.vibe, asset.status]);
        }

        return assets;
    }

    inferAssetType(prompt) {
        if (prompt.toLowerCase().includes('hero')) return 'Hero';
        if (prompt.toLowerCase().includes('benefit')) return 'Benefit';
        if (prompt.toLowerCase().includes('trust')) return 'Trust';
        if (prompt.toLowerCase().includes('social')) return 'Social Proof';
        if (prompt.toLowerCase().includes('cta')) return 'CTA';
        return 'Feature';
    }
}

module.exports = new AssetService();
