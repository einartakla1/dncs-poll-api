import type { VercelRequest, VercelResponse } from "@vercel/node";

export function checkAdminAuth(req: VercelRequest, res: VercelResponse): boolean {
    const apiKey = req.headers["x-api-key"];

    if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
        res.status(403).json({ error: "Unauthorized" });
        return false;
    }

    return true;
}
