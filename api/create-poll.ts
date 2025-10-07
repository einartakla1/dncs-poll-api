import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import { redis } from "./_client";
import { checkAdminAuth } from "./_auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") return res.status(405).end();

    if (!checkAdminAuth(req, res)) return;

    const { question, options } = req.body;
    if (!question || !options || !Array.isArray(options)) {
        return res.status(400).json({ error: "Missing question or options" });
    }

    const pollId = randomUUID();
    const poll = {
        pollId,
        question,
        options: JSON.stringify(options.map((opt, i) => ({ id: i, text: opt, votes: 0 }))),
        status: "active", // Changed from "draft" to "active"
        createdAt: Date.now(),
    };

    await redis.hset(`poll:${pollId}`, poll);
    await redis.sadd("polls", pollId);

    return res.status(200).json({ pollId });
}