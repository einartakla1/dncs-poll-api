import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_client";
import { createHash } from "crypto";

// Helper to hash IP for rate limiting
function hashIP(ip: string): string {
    return createHash('sha256').update(ip + process.env.RATE_LIMIT_SALT).digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS headers
    const allowedOrigins = [
        'https://dn.no',
        'https://www.dn.no',
        'https://editor.vev.design',
        'https://nhst.vev.site',
        'http://localhost:3000'
    ];

    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    // Handle preflight OPTIONS request
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        return res.status(405).end();
    }

    const { pollId, optionId, voterToken } = req.body;
    if (!pollId || optionId === undefined || !voterToken) {
        return res.status(400).json({ error: "Missing params" });
    }

    // Rate limiting by IP
    const clientIP = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || 'unknown';
    const ipHash = hashIP(clientIP);
    const rateLimitKey = `rl:ip:${ipHash}`;

    const requestCount = await redis.incr(rateLimitKey);
    if (requestCount === 1) {
        await redis.expire(rateLimitKey, 60); // 1 minute window
    }
    if (requestCount > 20) {
        return res.status(429).json({ error: "Too many requests. Please try again later." });
    }

    // Check if already voted using voterToken from body
    const voted = await redis.sismember(`voters:${pollId}`, voterToken);
    if (voted === 1) {
        return res.status(400).json({ error: "Already voted" });
    }

    // Get poll
    const poll = await redis.hgetall<Record<string, string>>(`poll:${pollId}`);
    if (!poll || !poll.pollId) {
        return res.status(404).json({ error: "Poll not found" });
    }

    // Check if poll is closed
    if (poll.status === "closed") {
        return res.status(403).json({ error: "Poll is closed" });
    }

    // Parse options
    const options = typeof poll.options === 'string' ? JSON.parse(poll.options) : poll.options;
    if (!options[optionId]) {
        return res.status(400).json({ error: "Invalid option" });
    }

    // Record vote
    options[optionId].votes++;
    await redis.hset(`poll:${pollId}`, { ...poll, options: JSON.stringify(options) });
    await redis.sadd(`voters:${pollId}`, voterToken);

    return res.status(200).json({
        success: true,
        poll: {
            question: poll.question,
            options: options,
            totalVotes: options.reduce((sum: number, opt: any) => sum + opt.votes, 0),
            showVoteCount: String(poll.showVoteCount) !== 'false'
        }
    });
}