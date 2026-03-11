const supabase = require('../config/supabase');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

exports.getCredentials = async (req, res) => {
    try {
        const userId = req.user?.id; 
        if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

        const { data, error } = await supabase
            .from('auth_credentials')
            .select('*')
            .eq('user_id', userId);

        if (error) throw error;
        res.json({ success: true, credentials: data });
    } catch (err) {
        console.error('[API] Get Credentials Error:', err.message);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

exports.saveCredential = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { credential } = req.body;

        if (!userId || !credential || !credential.id || !credential.publicKey) {
            return res.status(400).json({ success: false, error: 'Invalid payload' });
        }

        const safeData = {
            user_id: userId,
            credential_id: credential.id,
            public_key: credential.publicKey,
            counter: credential.counter || 0,
            transports: credential.transports || []
        };

        const { data, error } = await supabase
            .from('auth_credentials')
            .insert([safeData])
            .select();

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        console.error('[API] Save Cred Error:', err.message);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

exports.updateCredentialCounter = async (req, res) => {
    try {
        const { credentialId } = req.params;
        const { counter } = req.body;
        const userId = req.user?.id;

        if (!credentialId || typeof counter !== 'number') {
            return res.status(400).json({ success: false, error: 'Invalid parameters' });
        }

        const { error } = await supabase
            .from('auth_credentials')
            .update({ counter })
            .match({ id: credentialId, user_id: userId });

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error('[API] Update Counter Error:', err.message);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

exports.login = (req, res) => {
    try {
        const { password } = req.body;
        
        if (!password || typeof password !== 'string') {
             return res.status(400).json({ success: false, error: "Invalid request" });
        }

        const validPassword = process.env.AUTH_PASSWORD;
        const jwtSecret = process.env.JWT_SECRET;
        
        if (!jwtSecret) {
            console.error('[CRITICAL] JWT_SECRET missing.');
            return res.status(500).json({ success: false, error: 'Configuration error' });
        }
        
        const inputBuffer = Buffer.from(password);
        const validBuffer = Buffer.from(validPassword);

        if (inputBuffer.length === validBuffer.length && crypto.timingSafeEqual(inputBuffer, validBuffer)) {
            const token = jwt.sign({ id: 'admin' }, jwtSecret, { expiresIn: '7d' });
            
            const isProduction = process.env.NODE_ENV === 'production';
            res.cookie('auth_token', token, {
                httpOnly: true,
                secure: isProduction, // MOET true zijn op Render (HTTPS)
                sameSite: isProduction ? 'none' : 'lax', // MOET 'none' zijn omdat Vercel en Render andere domeinen zijn
                path: '/',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });

            return res.json({ success: true });
        }
        
        return res.status(401).json({ success: false, error: "Invalid Access Code" });
    } catch (err) {
        console.error('[API] Login Error:', err.message);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};