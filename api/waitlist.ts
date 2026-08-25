import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from './_lib/supabase';
import { isRateLimited, getClientIp } from './_lib/rateLimit';

interface WaitlistPayload {
    type: 'agent' | 'sponsor';
    email: string;
    name?: string;
    skills?: string;
    company?: string;
    needs?: string;
    website_url?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    referrer?: string;
    source_url?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Rate limiting
        const clientIp = getClientIp(req.headers);
        if (isRateLimited(clientIp)) {
            return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
        }

        const data = req.body as WaitlistPayload;

        // Honeypot anti-spam
        if (data.website_url) {
            return res.status(200).json({ success: true, message: 'Received (Bot detected)' });
        }

        // Validate required fields
        if (!data.email || !data.type) {
            return res.status(400).json({ error: 'Email and type are required.' });
        }

        if (!['agent', 'sponsor'].includes(data.type)) {
            return res.status(400).json({ error: 'Type must be agent or sponsor.' });
        }

        // Validate env
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.error('Missing Supabase env vars');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Insert into Supabase
        const { error } = await supabase.from('waitlist_leads').insert({
            type: data.type,
            email: data.email,
            name: data.name || null,
            company: data.company || null,
            skills: data.skills || null,
            needs: data.needs || null,
            source_url: data.source_url || null,
            referrer: data.referrer || null,
            utm_source: data.utm_source || null,
            utm_medium: data.utm_medium || null,
            utm_campaign: data.utm_campaign || null,
            utm_content: data.utm_content || null,
            utm_term: data.utm_term || null,
        });

        if (error) {
            console.error('Supabase insert error:', error.message);
            return res.status(500).json({ error: 'Failed to process application.' });
        }

        return res.status(200).json({ success: true, message: 'Application received successfully' });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Error submitting waitlist:', message);
        return res.status(500).json({ error: 'Failed to process application.' });
    }
}
