import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import { redis } from "./_client";
import { createHash } from "crypto";

// Helper to hash IP for rate limiting
function hashIP(ip: string): string {
    return createHash('sha256').update(ip + process.env.RATE_LIMIT_SALT).digest('hex');
}

// Helper to get or create voter token
function getVoterToken(req: VercelRequest, res: VercelResponse): string {
    const existingToken = req.cookies?.poll_token;

    if (existingToken) {
        return existingToken;
    }

    const newToken = randomUUID();
    res.setHeader("Set-Cookie", `poll_token=${newToken}; Path=/; HttpOnly; Max-Age=31536000; SameSite=None; Secure`);
    return newToken;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") return res.status(405).end();

    // CORS headers (adjust domains to your needs)
    const allowedOrigins = [
        'https://dn.no',
        'https://www.dn.no',
        'http://localhost:3000' // for development
    ];

    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    const { pollId, optionId } = req.body;
    if (!pollId || optionId === undefined) {
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

    // Get or create voter token
    const voterToken = getVoterToken(req, res);

    // Check if already voted
    const voted = await redis.sismember(`voters:${pollId}`, voterToken);
    if (voted) {
        return res.status(400).json({ error: "Already voted" });
    }

    // Get poll
    const poll = await redis.hgetall<Record<string, string>>(`poll:${pollId}`);
    if (!poll || !poll.pollId) {
        return res.status(404).json({ error: "Poll not found" });
    }

    // Check if poll is active (not draft)
    if (poll.status === "draft") {
        return res.status(403).json({ error: "Poll is not active" });
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
            totalVotes: options.reduce((sum: number, opt: any) => sum + opt.votes, 0)
        }
    });
}