import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_client";
import { checkAdminAuth } from "./_auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") return res.status(405).end();

    if (!checkAdminAuth(req, res)) return;

    const { pollId, question, options } = req.body;
    if (!pollId || !question || !Array.isArray(options)) {
        return res.status(400).json({ error: "Missing params" });
    }

    const poll = await redis.hgetall<Record<string, string>>(`poll:${pollId}`);
    if (!poll || !poll.pollId) return res.status(404).json({ error: "Poll not found" });

    // Parse existing options to preserve vote counts
    const existingOptions = typeof poll.options === 'string' ? JSON.parse(poll.options) : poll.options;

    // Map new options, preserving votes where option text matches
    const updatedOptions = options.map((newOptionText, index) => {
        // Try to find matching option by text in existing options
        const existingOption = existingOptions.find((opt: any) => opt.text === newOptionText);

        return {
            id: index,
            text: newOptionText,
            votes: existingOption ? existingOption.votes : 0 // Preserve votes if option exists, otherwise 0
        };
    });

    await redis.hset(`poll:${pollId}`, {
        ...poll,
        question,
        options: JSON.stringify(updatedOptions),
    });

    return res.status(200).json({ success: true });
}