const SimpleWebAuthn = require('@simplewebauthn/server');
const supabase = require('../config/supabase');

const challengeStore = new Map();

const rpName = 'ShadowBrain';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.RP_ORIGIN || 'http://localhost:3000';

const formatCredential = (cred) => ({
    id: cred.id,
    type: 'public-key',
    transports: typeof cred.transports === 'string' ? JSON.parse(cred.transports) : cred.transports,
});

exports.register = async (req, res) => {
    try {
        const { action, username, data } = req.body;

        if (action === 'generate-options') {
            const { data: existingCreds } = await supabase
                .from('auth_credentials')
                .select('id, transports')
                .eq('user_id', username);

            const options = await SimpleWebAuthn.generateRegistrationOptions({
                rpName,
                rpID,
                userID: new Uint8Array(Buffer.from(username)),
                userName: username,
                attestationType: 'none',
                excludeCredentials: existingCreds?.map(formatCredential),
                authenticatorSelection: {
                    residentKey: 'preferred',
                    userVerification: 'preferred',
                    authenticatorAttachment: 'platform',
                },
            });

            challengeStore.set(username, options.challenge);
            return res.json(options);
        }

        if (action === 'verify') {
            const expectedChallenge = challengeStore.get(username);
            if (!expectedChallenge) return res.status(400).json({ error: 'Challenge verlopen of niet gevonden' });

            const verification = await SimpleWebAuthn.verifyRegistrationResponse({
                response: data,
                expectedChallenge,
                expectedOrigin: origin,
                expectedRPID: rpID,
            });

            if (verification.verified && verification.registrationInfo) {
                const { credential } = verification.registrationInfo;
                
                const newCredential = {
                    user_id: username,
                    id: credential.id,
                    public_key: Buffer.from(credential.publicKey).toString('base64url'),
                    counter: credential.counter,
                    transports: credential.transports || [],
                };

                const { error } = await supabase.from('auth_credentials').insert([newCredential]);
                if (error) throw error;

                challengeStore.delete(username);
                return res.json({ verified: true });
            }
            return res.status(400).json({ verified: false, error: 'Verificatie mislukt' });
        }
    } catch (err) {
        console.error('[Passkey Register Error]:', err.message);
        res.status(500).json({ error: 'Interne serverfout tijdens registratie' });
    }
};

exports.authenticate = async (req, res) => {
    try {
        const { action, username, data } = req.body;

        if (action === 'generate-options') {
            const { data: userCredentials } = await supabase
                .from('auth_credentials')
                .select('id, transports')
                .eq('user_id', username);

            if (!userCredentials?.length) return res.status(400).json({ error: 'Geen passkeys gevonden voor deze gebruiker' });

            const options = await SimpleWebAuthn.generateAuthenticationOptions({
                rpID,
                allowCredentials: userCredentials.map(formatCredential),
                userVerification: 'preferred',
            });

            challengeStore.set(username, options.challenge);
            return res.json(options);
        }

        if (action === 'verify') {
            const expectedChallenge = challengeStore.get(username);
            if (!expectedChallenge) return res.status(400).json({ error: 'Challenge niet gevonden' });

            const { data: dbCred, error } = await supabase
                .from('auth_credentials')
                .select('*')
                .eq('id', data.id)
                .single();

            if (error || !dbCred) return res.status(400).json({ error: 'Onbekende credential' });

            const verification = await SimpleWebAuthn.verifyAuthenticationResponse({
                response: data,
                expectedChallenge,
                expectedOrigin: origin,
                expectedRPID: rpID,
                credential: {
                    id: dbCred.id,
                    publicKey: Buffer.from(dbCred.public_key, 'base64url'),
                    counter: dbCred.counter || 0,
                    transports: typeof dbCred.transports === 'string' ? JSON.parse(dbCred.transports) : dbCred.transports,
                },
            });

            if (verification.verified) {
                await supabase
                    .from('auth_credentials')
                    .update({ counter: verification.authenticationInfo.newCounter })
                    .eq('id', dbCred.id);

                challengeStore.delete(username);
                return res.json({ verified: true });
            }
            return res.status(400).json({ verified: false, error: 'Authenticatie mislukt' });
        }
    } catch (err) {
        console.error('[Passkey Auth Error]:', err.message);
        res.status(500).json({ error: 'Interne serverfout tijdens authenticatie' });
    }
};