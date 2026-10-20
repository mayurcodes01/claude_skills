const { json, getSession, sameOrigin, kv, SLUG_RE } = require("./_lib");

// Each signed in person's saved skills, kept on the server so they follow the account.
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const s = getSession(req);
    if (!s) return json(res, 401, { error: "Sign in first" });
    const key = "saved:" + s.uid;
    if (req.method === "GET") return json(res, 200, { saved: (await kv("SMEMBERS", key)) || [] });
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
    if (!sameOrigin(req)) return json(res, 403, { error: "Forbidden" });
    const b = req.body && typeof req.body === "object" ? req.body : {};
    if (typeof b.slug !== "string" || !SLUG_RE.test(b.slug) || typeof b.on !== "boolean") return json(res, 400, { error: "Bad request" });
    if (b.on) {
      if ((await kv("SCARD", key)) >= 500) return json(res, 400, { error: "Saved list is full" });
      await kv("SADD", key, b.slug);
    } else {
      await kv("SREM", key, b.slug);
    }
    json(res, 200, { ok: true });
  } catch (e) {
    console.error("saved error", e.message);
    json(res, 502, { error: "Could not update saved skills" });
  }
};
