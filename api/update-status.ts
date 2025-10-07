import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_client";
import { checkAdminAuth } from "./_auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") return res.status(405).end();

    if (!checkAdminAuth(req, res)) return;

    const { pollId, status } = req.body;
    if (!pollId || !status) {
        return res.status(400).json({ error: "Missing pollId or status" });
    }

    // Only allow active or closed
    if (!["active", "closed"].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be: active or closed" });
    }

    const poll = await redis.hgetall<Record<string, string>>(`poll:${pollId}`);
    if (!poll || !poll.pollId) {
        return res.status(404).json({ error: "Poll not found" });
    }

    await redis.hset(`poll:${pollId}`, { ...poll, status: status });

    return res.status(200).json({ success: true, status: status });
}