import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_client";
import { checkAdminAuth } from "./_auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "GET") return res.status(405).end();

    if (!checkAdminAuth(req, res)) return;

    const { status } = req.query;

    const pollIds = await redis.smembers("polls");
    const polls = [];

    for (const id of pollIds) {
        const poll = await redis.hgetall<Record<string, string>>(`poll:${id}`);
        if (!poll || !poll.pollId) continue;

        if (!status || poll.status === status) {
            polls.push({
                pollId: poll.pollId,
                question: poll.question,
                status: poll.status,
                createdAt: poll.createdAt,
                options: typeof poll.options === 'string' ? JSON.parse(poll.options) : poll.options,
            });
        }
    }

    return res.status(200).json(polls);
}
