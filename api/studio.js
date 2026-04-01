'use strict';
const router = require('express').Router();
const { db } = require('../services/db');
const { StudioService } = require('../services/StudioService');

/**
 * NEXUS Studio API
 */

// List all projects (for HUD sync)
router.get('/projects/all', async (req, res) => {
    try {
        const projects = await db.any('SELECT id, offer_id, name, status FROM studio_projects');
        res.json({ success: true, data: projects });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// List projects for an offer
router.get('/projects/:offerId', async (req, res) => {
    try {
        const projects = await db.any('SELECT * FROM studio_projects WHERE offer_id = $1 ORDER BY created_at DESC', [req.params.offerId]);
        res.json({ success: true, data: projects });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Create a new project (Drafting)
router.post('/projects', async (req, res) => {
    const { offerId, name, persona, vibe, alphaKeywords } = req.body;
    try {
        const project = await StudioService.createProject(offerId, name, persona, vibe, alphaKeywords);
        
        // Auto-generate blueprint in background
        StudioService.generateBlueprint(project.id).catch(err => console.error(`Blueprint error: ${err.message}`));
        
        res.json({ success: true, data: project });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get project details with blueprint and funnel
router.get('/projects/detail/:projectId', async (req, res) => {
    try {
        const project = await db.oneOrNone('SELECT * FROM studio_projects WHERE id = $1', [req.params.projectId]);
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
        
        const blueprint = await db.oneOrNone('SELECT * FROM studio_blueprints WHERE project_id = $1', [req.params.projectId]);
        const funnel    = await db.oneOrNone('SELECT * FROM studio_funnels WHERE project_id = $1', [req.params.projectId]);
        const assets    = await db.any('SELECT * FROM studio_assets WHERE project_id = $1', [req.params.projectId]);
        
        res.json({ success: true, data: { project, blueprint, funnel, assets } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Generate/Update Funnel Draft
router.post('/projects/:projectId/generate', async (req, res) => {
    try {
        const blueprint = await StudioService.generateBlueprint(req.params.projectId);
        res.json({ success: true, data: blueprint });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Generate/Update Funnel Draft (Layout)
router.post('/projects/:projectId/draft', async (req, res) => {
    try {
        const funnel = await StudioService.generateInitialDraft(req.params.projectId);
        res.json({ success: true, data: funnel });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Generate/Production Assets (Batch)
router.post('/projects/:projectId/assets', async (req, res) => {
    const { vibe } = req.body;
    try {
        const assets = await StudioService.generateAssets(req.params.projectId, vibe || 'professional');
        res.json({ success: true, data: assets });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Save Funnel (from Editor)
router.post('/projects/:projectId/save', async (req, res) => {
    const { layoutData } = req.body;
    try {
        await db.run('UPDATE studio_funnels SET layout_data = $1, updated_at = NOW() WHERE project_id = $2', [JSON.stringify(layoutData), req.params.projectId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
