/**
 * Auth Controller
 * Handles user authentication credentials (WebAuthn/Passkeys).
 */
const supabase = require('../config/supabase');

exports.getCredentials = async (req, res) => {
    try {
        const { userId } = req.params;
        const { data, error } = await supabase
            .from('auth_credentials')
            .select('*')
            .eq('user_id', userId);

        if (error) throw error;
        res.json({ success: true, credentials: data });
    } catch (err) {
        console.error('[API] Get Credentials Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.saveCredential = async (req, res) => {
    try {
        const { credential } = req.body;
        const { data, error } = await supabase
            .from('auth_credentials')
            .insert([credential])
            .select();

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        console.error('[API] Save Credential Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.updateCredentialCounter = async (req, res) => {
    try {
        const { credentialId } = req.params;
        const { counter } = req.body;
        const { error } = await supabase
            .from('auth_credentials')
            .update({ counter })
            .eq('id', credentialId);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error('[API] Update Counter Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};
