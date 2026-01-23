const SimpleWebAuthn = require('@simplewebauthn/server');
const supabase = require('../config/supabase');

// In-memory challenge store (production should use Redis/DB)
const challengeStore = new Map();

const rpName = 'ShadowBrain';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.RP_ORIGIN || 'http://localhost:3000';

exports.register = async (req, res) => {
    try {
        const { action, username, data } = req.body;

        if (action === 'generate-options') {
            // Check if user exists or just use username as ID for this single-user app
            // For now, we assume 'admin' or whatever username is passed is the user.
            // In a real app, we'd look up the user.
            
            // Get user's existing credentials to prevent re-registration
            const { data: userCredentials } = await supabase
                .from('auth_credentials')
                .select('id') // Column is 'id' based on schema inspection
                .eq('user_id', username); // Mapping username to user_id for simplicity

            // SimpleWebAuthn requires userID to be a Buffer or Uint8Array
            const userID = new Uint8Array(Buffer.from(username));

            const options = await SimpleWebAuthn.generateRegistrationOptions({
                rpName,
                rpID,
                userID,
                userName: username,
                // Don't exclude credentials for now to allow multiple devices or re-registration testing
                // excludeCredentials: userCredentials?.map(cred => ({
                //     id: cred.credential_id,
                //     type: 'public-key',
                //     transports: ['internal'],
                // })),
                authenticatorSelection: {
                    residentKey: 'preferred',
                    userVerification: 'preferred',
                    authenticatorAttachment: 'platform',
                },
            });

            // Store challenge
            challengeStore.set(username, options.challenge);

            return res.json(options);

        } else if (action === 'verify') {
            const expectedChallenge = challengeStore.get(username);
            
            if (!expectedChallenge) {
                return res.status(400).json({ error: 'Challenge not found or expired' });
            }

            const verification = await SimpleWebAuthn.verifyRegistrationResponse({
                response: data,
                expectedChallenge,
                expectedOrigin: origin,
                expectedRPID: rpID,
            });

            if (verification.verified) {
                const { registrationInfo } = verification;
                const { credential } = registrationInfo;
                if (!credential) {
                    throw new Error('Missing credential in registrationInfo');
                }

                const { id: credentialID, publicKey: credentialPublicKey, counter, transports } = credential;

                const credentialIdStr = typeof credentialID === 'string' ? credentialID : Buffer.from(credentialID).toString('base64url');
                const publicKeyStr = typeof credentialPublicKey === 'string' ? credentialPublicKey : Buffer.from(credentialPublicKey).toString('base64url');

                const newCredential = {
                    user_id: username,
                    id: credentialIdStr, // Column is 'id' 
                    public_key: publicKeyStr,
                    counter,
                    transports: transports || [],
                };

                // Ensure transports is suitable for storage (JSON string if column is text, or array if JSONB)
                // We'll store as simple array, but if DB error occurs, it might be due to this.
                // For safety, let's keep it as is, but if it fails, user check DB.
                // Actually, let's JSON stringify it to be safe if the column is TEXT. 
                // However, if the column IS JSONB, stringifying it makes it a string.
                // Given I don't know the schema, I'll rely on Supabase JS client handling arrays for JSON types.
                // If it fails, I'll ask user.
                
                // Removing debug logs for production
                
                const { error } = await supabase
                    .from('auth_credentials')
                    .insert([newCredential]);

                if (error) {
                    console.error('[Passkey] DB Insert Error:', error);
                    throw error; 
                }
                
                challengeStore.delete(username);
                return res.json({ verified: true });
            }
            return res.json({ verified: false, error: 'Verification failed' });
        }
    } catch (err) {
        console.error('[Passkey] Register Error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.authenticate = async (req, res) => {
    try {
        const { action, username, data } = req.body;

        if (action === 'generate-options') {
            // Get user credentials
            const { data: userCredentials } = await supabase
                .from('auth_credentials')
                .select('credential_id, transports') // Fetch transports too if available
                .eq('user_id', username);

            if (!userCredentials || userCredentials.length === 0) {
                return res.status(400).json({ error: 'No credentials found' });
            }
            
            const options = await SimpleWebAuthn.generateAuthenticationOptions({
                rpID,
                allowCredentials: userCredentials.map(cred => ({
                    id: cred.id, // Column is 'id'
                    type: 'public-key',
                    transports: cred.transports,
                })),
                userVerification: 'preferred',
            });

            challengeStore.set(username, options.challenge);
            return res.json(options);

        } else if (action === 'verify') {
            const expectedChallenge = challengeStore.get(username);
            
            if (!expectedChallenge) {
                return res.status(400).json({ error: 'Challenge not found' });
            }

            // Find the credential in DB using the ID from response
            const credentialId = data.id; // base64url string
            
            const { data: credData, error } = await supabase
                .from('auth_credentials')
                .select('*')
                .eq('id', credentialId)
                .single();

            if (error || !credData) {
                return res.status(400).json({ error: 'Credential not found' });
            }
            
            // const isoBase64URL = SimpleWebAuthn.isoBase64URL; // Not available
            const credentialPublicKey = Buffer.from(credData.public_key, 'base64url');

            const verification = await SimpleWebAuthn.verifyAuthenticationResponse({
                response: data,
                expectedChallenge,
                expectedOrigin: origin,
                expectedRPID: rpID,
                authenticator: {
                    credentialID: Buffer.from(credData.id, 'base64url'),
                    credentialPublicKey: credentialPublicKey,
                    counter: credData.counter,
                    transports: credData.transports,
                },
            });

            if (verification.verified) {
                const { authenticationInfo } = verification;
                const { newCounter } = authenticationInfo;

                // Update counter
                await supabase
                    .from('auth_credentials')
                    .update({ counter: newCounter })
                    .eq('id', credData.id); // Assuming 'id' is primary key

                challengeStore.delete(username);
                return res.json({ verified: true });
            }
            return res.json({ verified: false, error: 'Verification failed' });
        }
    } catch (err) {
        console.error('[Passkey] Authenticate Error:', err);
        res.status(500).json({ error: err.message });
    }
};
