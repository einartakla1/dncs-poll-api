import type { VercelRequest, VercelResponse } from "@vercel/node";
import { v4 as uuidv4 } from "uuid";
import { redis } from "./_client";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") return res.status(405).end();

    const { question, options } = req.body;
    if (!question || !options || !Array.isArray(options)) {
        return res.status(400).json({ error: "Missing question or options" });
    }

    const pollId = uuidv4();
    const poll = {
        pollId,
        question,
        options: JSON.stringify(options.map((opt, i) => ({ id: i, text: opt, votes: 0 }))),
        status: "draft",
        createdAt: Date.now(),
    };

    await redis.hset(`poll:${pollId}`, poll);
    await redis.sadd("polls", pollId);

    return res.status(200).json({ pollId });
}
