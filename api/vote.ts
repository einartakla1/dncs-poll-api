import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_client";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") return res.status(405).end();

    const { pollId, optionId, voterId } = req.body;
    if (!pollId || optionId === undefined || !voterId) {
        return res.status(400).json({ error: "Missing params" });
    }

    const voted = await redis.sismember(`voters:${pollId}`, voterId);
    if (voted) return res.status(400).json({ error: "Already voted" });

    const poll = await redis.hgetall<Record<string, string>>(`poll:${pollId}`);
    if (!poll || !poll.pollId) return res.status(404).json({ error: "Poll not found" });

    const options = JSON.parse(poll.options as string);
    if (!options[optionId]) return res.status(400).json({ error: "Invalid option" });

    options[optionId].votes++;
    await redis.hset(`poll:${pollId}`, { ...poll, options: JSON.stringify(options) });
    await redis.sadd(`voters:${pollId}`, voterId);

    return res.status(200).json({ success: true });
}
