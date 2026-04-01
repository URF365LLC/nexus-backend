'use strict';
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { db } = require('./db');

/**
 * NEXUS Blueprint Engine
 * 
 * High-fidelity funnel strategy orchestrator.
 * Chaining Perplexity (Research) + Claude 3.5 (Strategy) + GPT-4o (Micro-copy).
 */

class BlueprintService {
    
    constructor() {
        this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        this.openai    = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.grok      = new OpenAI({ 
            apiKey: process.env.XAI_API_KEY, 
            baseURL: "https://api.x.ai/v1" 
        });
        if (process.env.GEMINI_API_KEY) {
            this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        }
    }

    /**
     * Generate a full marketing blueprint from a project ID
     */
    async generate(projectId) {
        console.log(`[BlueprintEngine] Initializing intelligence cycle for project: ${projectId}`);
        
        // 1. Load Context
        const project = await db.get('SELECT * FROM studio_projects WHERE id = $1', [projectId]);
        if (!project) throw new Error('Project not found');
        
        const offer = await db.get('SELECT * FROM mb_offers WHERE id = $1', [project.offer_id]);
        
        // 2. Intelligence Chain (Simplified for Alpha)
        // In reality, this would first call Perplexity for competitor research.
        
        const systemPrompt = `
You are an ELITE Direct Response Copywriter (think Gary Halbert, David Ogilvy, and Viktor Frankl). 
Your task is to build a high-converting Sales Funnel Blueprint for the following offer.

RULES:
- Clarity > Cleverness.
- Specificity > Buzzwords.
- Focus on the Transformation (Before vs After).
- One Idea per section.
- Strictly adhere to MaxBounty compliance (No false claims).

FRAMEWORK:
1. Empathy Map: Deeply understand the target persona's pain and desire.
2. The Big Idea: A central hook that breaks patterns.
3. Funnel Structure: A sequence of sections (Problem, Agitation, Solution, Proof, CTA).

OUTPUT: 
Your response MUST be a valid JSON object matching the requested schema.
        `;

        const userPrompt = `
OFFER: ${offer.name}
VERTICAL: ${offer.vertical}
TARGET PERSONA: ${project.target_persona}
VIBE: ${project.target_vibe}
ALPHA KEYWORDS: ${project.alpha_keywords}

Generate a comprehensive marketing blueprint in JSON format.
        `;

        // 3. Selection Strategy (Claude-3.5 is the defaults strategy engine)
        const response = await this.anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 4000,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }]
        });

        // 4. Imagination Phase (Gemini 1.5 Pro)
        // Gemini is superior at visual imagination and creative mapping.
        let imagePrompts = [];
        if (this.genAI) {
            console.log(`[BlueprintEngine] Activating Gemini 1.5 Pro for visual imagination...`);
            try {
                const geminiModel = this.genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
                const imaginationPrompt = `
                    Based on this marketing strategy: ${response.content[0].text}
                    Generate 5 highly specific DALL-E/Midjourney style image prompts for a high-converting landing page.
                    Include: Hero, Benefit, Social Proof, Trust, and CTA background.
                    Format: JSON array of strings.
                `;
                const geminiResult = await geminiModel.generateContent(imaginationPrompt);
                const geminiResponse = await geminiResult.response;
                imagePrompts = JSON.parse(geminiResponse.text().match(/\[[\s\S]*\]/)[0]);
            } catch (err) {
                console.error(`[BlueprintEngine] Gemini imagination failed: ${err.message}`);
            }
        }

        const blueprintData = this.parseJsonFromAi(response.content[0].text);
        blueprintData.visual_strategy = imagePrompts;
        
        // 3. Persist to DB
        await db.run(`
            INSERT INTO studio_blueprints (project_id, results, model_version)
            VALUES ($1, $2, 'claude-3.5-sonnet')
            ON CONFLICT (project_id) DO UPDATE SET results = EXCLUDED.results, updated_at = NOW()
        `, [projectId, JSON.stringify(blueprintData)]);
        
        // 4. Update Project Status
        await db.run('UPDATE studio_projects SET status = $1, updated_at = NOW() WHERE id = $2', ['strategy_ready', projectId]);

        return blueprintData;
    }

    parseJsonFromAi(text) {
        try {
            const match = text.match(/\{[\s\S]*\}/);
            return match ? JSON.parse(match[0]) : { error: 'Failed to parse AI JSON', raw: text };
        } catch (e) {
            return { error: 'Invalid JSON from AI', raw: text };
        }
    }
}

module.exports = new BlueprintService();
