import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_client";
import { checkAdminAuth } from "./_auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") return res.status(405).end();

    if (!checkAdminAuth(req, res)) return;

    const { pollId } = req.body;
    if (!pollId) return res.status(400).json({ error: "Missing pollId" });

    const poll = await redis.hgetall<Record<string, string>>(`poll:${pollId}`);
    if (!poll || !poll.pollId) return res.status(404).json({ error: "Poll not found" });

    // Delete the poll and all associated data
    await redis.del(`poll:${pollId}`);
    await redis.del(`voters:${pollId}`);
    await redis.srem("polls", pollId);

    return res.status(200).json({ success: true });
}