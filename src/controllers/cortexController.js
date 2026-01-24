const supabase = require('../config/supabase');

exports.handleWebhook = async (req, res) => {
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
        console.error('[CORTEX ERROR]', err.message);
        res.status(500).send('Server Error');
    }
};
