'use strict';
const router = require('express').Router();
const { db } = require('../services/db');
const { StudioService } = require('../services/StudioService');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_PERSONAS = ['ogilvy', 'halbert', 'schwartz', 'hopkins', 'custom'];
const MAX_STR = 500;

function isValidUuid(v) { return UUID_RE.test(v); }

/**
 * NEXUS Studio API
 */

// List all projects (for HUD sync)
router.get('/projects/all', async (req, res) => {
    try {
        const projects = await db.all('SELECT id, offer_id, name, status FROM studio_projects');
        res.json({ success: true, data: projects });
    } catch (err) {
        console.error('[Studio] GET /projects/all', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// List projects for an offer
router.get('/projects/:offerId', async (req, res) => {
    const { offerId } = req.params;
    if (!isValidUuid(offerId)) {
        return res.status(400).json({ success: false, error: 'Invalid offer ID format' });
    }
    try {
        const projects = await db.all(
            'SELECT id, offer_id, name, status, created_at, updated_at FROM studio_projects WHERE offer_id = $1::uuid ORDER BY created_at DESC',
            [offerId]
        );
        res.json({ success: true, data: projects });
    } catch (err) {
        console.error('[Studio] GET /projects/:offerId', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Create a new project
router.post('/projects', async (req, res) => {
    const { offerId, name, persona, vibe, alphaKeywords } = req.body;

    if (!offerId || !isValidUuid(offerId)) {
        return res.status(400).json({ success: false, error: 'Invalid or missing offerId' });
    }
    if (!name || typeof name !== 'string' || name.length > MAX_STR) {
        return res.status(400).json({ success: false, error: 'Invalid or missing name (max 500 chars)' });
    }
    if (!persona || !VALID_PERSONAS.includes(persona)) {
        return res.status(400).json({ success: false, error: `Invalid persona. Must be one of: ${VALID_PERSONAS.join(', ')}` });
    }
    if (vibe && (typeof vibe !== 'string' || vibe.length > MAX_STR)) {
        return res.status(400).json({ success: false, error: 'Invalid vibe (max 500 chars)' });
    }

    try {
        const project = await StudioService.createProject(offerId, name, persona, vibe, alphaKeywords);
        StudioService.generateBlueprint(project.id).catch(err => console.error(`Blueprint error: ${err.message}`));
        res.json({ success: true, data: project });
    } catch (err) {
        console.error('[Studio] POST /projects', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get project details with blueprint and funnel
router.get('/projects/detail/:projectId', async (req, res) => {
    const { projectId } = req.params;
    if (!isValidUuid(projectId)) {
        return res.status(400).json({ success: false, error: 'Invalid project ID format' });
    }
    try {
        const project = await db.get(
            'SELECT id, offer_id, name, status, target_persona, target_vibe, alpha_keywords, created_at, updated_at FROM studio_projects WHERE id = $1::uuid',
            [projectId]
        );
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

        const blueprint = await db.get(
            'SELECT id, project_id, results, model_version, created_at, updated_at FROM studio_blueprints WHERE project_id = $1::uuid',
            [projectId]
        );
        const funnel = await db.get(
            'SELECT id, project_id, layout_data, created_at, updated_at FROM studio_funnels WHERE project_id = $1::uuid',
            [projectId]
        );
        const assets = await db.all(
            'SELECT id, project_id, asset_type, content_url, created_at FROM studio_assets WHERE project_id = $1::uuid',
            [projectId]
        );

        res.json({ success: true, data: { project, blueprint, funnel, assets } });
    } catch (err) {
        console.error('[Studio] GET /projects/detail/:projectId', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Generate/Update Blueprint
router.post('/projects/:projectId/generate', async (req, res) => {
    const { projectId } = req.params;
    if (!isValidUuid(projectId)) {
        return res.status(400).json({ success: false, error: 'Invalid project ID format' });
    }
    try {
        const blueprint = await StudioService.generateBlueprint(projectId);
        res.json({ success: true, data: blueprint });
    } catch (err) {
        console.error('[Studio] POST /projects/:projectId/generate', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Generate Funnel Draft (Layout)
router.post('/projects/:projectId/draft', async (req, res) => {
    const { projectId } = req.params;
    if (!isValidUuid(projectId)) {
        return res.status(400).json({ success: false, error: 'Invalid project ID format' });
    }
    try {
        const funnel = await StudioService.generateInitialDraft(projectId);
        res.json({ success: true, data: funnel });
    } catch (err) {
        console.error('[Studio] POST /projects/:projectId/draft', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Generate Production Assets (Batch)
router.post('/projects/:projectId/assets', async (req, res) => {
    const { projectId } = req.params;
    const { vibe } = req.body;
    if (!isValidUuid(projectId)) {
        return res.status(400).json({ success: false, error: 'Invalid project ID format' });
    }
    try {
        const assets = await StudioService.generateAssets(projectId, vibe || 'professional');
        res.json({ success: true, data: assets });
    } catch (err) {
        console.error('[Studio] POST /projects/:projectId/assets', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Save Funnel (from Editor)
router.post('/projects/:projectId/save', async (req, res) => {
    const { projectId } = req.params;
    const { layoutData } = req.body;
    if (!isValidUuid(projectId)) {
        return res.status(400).json({ success: false, error: 'Invalid project ID format' });
    }
    if (!layoutData || typeof layoutData !== 'object') {
        return res.status(400).json({ success: false, error: 'Invalid or missing layoutData' });
    }
    try {
        await db.run(
            'UPDATE studio_funnels SET layout_data = $1, updated_at = NOW() WHERE project_id = $2::uuid',
            [JSON.stringify(layoutData), projectId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('[Studio] POST /projects/:projectId/save', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;
