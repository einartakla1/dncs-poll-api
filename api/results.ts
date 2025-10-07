import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_client";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "GET") return res.status(405).end();

    // CORS headers
    const allowedOrigins = [
        'https://yourdomain.com',
        'https://www.yourdomain.com',
        'http://localhost:3000'
    ];

    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    const pollId = req.query.pollId as string;
    if (!pollId) {
        return res.status(400).json({ error: "Missing pollId" });
    }

    const poll = await redis.hgetall<Record<string, string>>(`poll:${pollId}`);
    if (!poll || !poll.pollId) {
        return res.status(404).json({ error: "Poll not found" });
    }

    // Only return public polls (not drafts)
    if (poll.status === "draft") {
        return res.status(403).json({ error: "Poll is not public" });
    }

    const options = typeof poll.options === 'string' ? JSON.parse(poll.options) : poll.options;
    const totalVotes = options.reduce((sum: number, opt: any) => sum + opt.votes, 0);

    // Check if this voter has already voted (for UI state)
    const voterToken = req.cookies?.poll_token;
    let hasVoted = false;
    let userVote = null;

    if (voterToken) {
        hasVoted = await redis.sismember(`voters:${pollId}`, voterToken);
        // If voted, we don't track which option (for privacy), so just return true
    }

    return res.status(200).json({
        question: poll.question,
        options: options,
        totalVotes: totalVotes,
        hasVoted: hasVoted
    });
}