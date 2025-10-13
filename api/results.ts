import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_client";

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
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    // Handle preflight OPTIONS - BEFORE any other method checks
    if (req.method === "OPTIONS") return res.status(200).end();

    // Now check for GET
    if (req.method !== "GET") return res.status(405).end();

    const pollId = req.query.pollId as string;
    const voterToken = req.query.voterToken as string; // Get voterToken from query params

    if (!pollId) return res.status(400).json({ error: "Missing pollId" });

    const poll = await redis.hgetall<Record<string, string>>(`poll:${pollId}`);
    if (!poll || !poll.pollId) return res.status(404).json({ error: "Poll not found" });

    const options = typeof poll.options === 'string' ? JSON.parse(poll.options) : poll.options;

    // Parse showVoteCount (defaults to true for backwards compatibility)
    const showVoteCount = String(poll.showVoteCount) !== 'false';

    // Check if this voter has already voted using voterToken from query
    let hasVoted = false;

    if (voterToken) {
        const voted = await redis.sismember(`voters:${pollId}`, voterToken);
        hasVoted = voted === 1;
    }

    // Conditionally include vote counts based on showVoteCount setting
    let responseOptions;
    let totalVotes;

    responseOptions = options;
    totalVotes = options.reduce((sum: number, opt: any) => sum + opt.votes, 0);


    return res.status(200).json({
        question: poll.question,
        options: responseOptions,
        totalVotes: totalVotes,
        hasVoted: hasVoted,
        status: poll.status || "active",
        isClosed: poll.status === "closed",
        showVoteCount: showVoteCount
    });
}