import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_client";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") return res.status(405).end();

    const { pollId, question, options } = req.body;
    if (!pollId || !question || !Array.isArray(options)) {
        return res.status(400).json({ error: "Missing params" });
    }

    const poll = await redis.hgetall<Record<string, string>>(`poll:${pollId}`);
    if (!poll || !poll.pollId) return res.status(404).json({ error: "Poll not found" });

    await redis.hset(`poll:${pollId}`, {
        ...poll,
        question,
        options: JSON.stringify(options.map((opt, i) => ({ id: i, text: opt, votes: 0 }))),
    });

    return res.status(200).json({ success: true });
}
