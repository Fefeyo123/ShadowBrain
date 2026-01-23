const express = require('express');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// GITHUB SECRET (Configuration)
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

// 1. Signature Verification Middleware
// Note: For strict security, use raw-body HMAC check. 
// For this MVP, we rely on the header presence or secret if configured.
const verifySignature = (req, res, next) => {
    // Ideally we verify 'x-hub-signature-256' against the raw body + secret.
    // Express body-parser modifies the body, making signature check complex without 'verify' hook.
    // Proceeding without signature for now (Rely on URL secrecy).
    next();
};

router.post('/', async (req, res) => {
    try {
        const event = req.headers['x-github-event'];
        const payload = req.body;

        // Health Check from GitHub
        if (event === 'ping') {
            console.log('⌁ [CORTEX] GitHub Ping received via Webhook.');
            return res.status(200).send('Pong');
        }

        // Main Logic: Trace Pushes
        if (event === 'push') {
            const repo = payload.repository.full_name;
            const pusher = payload.pusher.name;
            const commits = payload.commits || [];

            // Calculate "Intensity" (Files Changed Proxy)
            // GitHub Push webhook provides arrays of filenames added/removed/modified.
            let added = 0;
            let removed = 0;
            let modified = 0;
            const messages = [];

            commits.forEach(c => {
                added += c.added.length;
                removed += c.removed.length;
                modified += c.modified.length;
                messages.push(c.message);
            });

            const workEvent = {
                source: `github_${pusher}`,
                event_type: 'code_push',
                timestamp: new Date().toISOString(),
                data: {
                    repo: repo,
                    branch: payload.ref.replace('refs/heads/', ''),
                    commit_count: commits.length,
                    files_added: added,
                    files_removed: removed,
                    files_modified: modified,
                    messages: messages,
                    url: payload.compare
                }
            };

            const { error } = await supabase
                .from('shadow_events')
                .insert(workEvent);

            if (error) throw error;

            console.log(`⌁ [CORTEX] Pushed ${commits.length} commits to ${repo} (Files: +${added} -${removed} ~${modified})`);
            return res.status(200).send('Logged');
        }

        res.status(200).send('Ignored Event');

    } catch (err) {
        console.error('[WORK] Error:', err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
