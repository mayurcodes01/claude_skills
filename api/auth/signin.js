const { json, sameOrigin, normEmail, checkPassword, kv, limit, clientIp, startEmailSession } = require("../_lib");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!sameOrigin(req)) return json(res, 403, { error: "Forbidden" });
  try {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const email = normEmail(b.email);
    const pw = typeof b.password === "string" ? b.password.slice(0, 128) : "";
    if (!email) return json(res, 400, { field: "em", error: "Enter a valid email address." });
    if (!pw) return json(res, 400, { field: "pw", error: "Enter your password." });

    const tries = "rl:in:" + email + ":" + clientIp(req);
    const wait = { field: "pw", error: "Too many attempts. Wait 15 minutes and try again." };
    if (!(await limit(tries, 8, 900)) || !(await limit("rl:inE:" + email, 30, 3600))) return json(res, 429, wait);

    const raw = await kv("GET", "user:" + email);
    const u = raw ? JSON.parse(raw) : null;
    const ok = await checkPassword(pw, u && u.pw);
    if (!u || !ok) return json(res, 401, { field: "pw", error: "Those details do not match. Check them and try again." });

    await kv("DEL", tries);
    startEmailSession(res, email, u.name);
    json(res, 200, { user: { name: u.name } });
  } catch (e) {
    console.error("signin error", e.message);
    json(res, 500, { field: "pw", error: "Could not sign in right now. Try again in a moment." });
  }
};
