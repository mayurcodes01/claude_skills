const { json, getSession, sameOrigin, checkPassword, kv, setCookie, SESSION_COOKIE } = require("./_lib");

// Lets a person delete their own account and saved skills (password required).
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!sameOrigin(req)) return json(res, 403, { error: "Forbidden" });
  try {
    const s = getSession(req);
    if (!s) return json(res, 401, { error: "Sign in first" });
    if (s.type !== "em") return json(res, 400, { error: "Publisher sessions have no site account to delete." });
    const pw = req.body && typeof req.body.password === "string" ? req.body.password.slice(0, 128) : "";
    if (!pw) return json(res, 400, { field: "pw", error: "Enter your password." });
    const raw = await kv("GET", "user:" + s.email);
    const u = raw ? JSON.parse(raw) : null;
    if (!(await checkPassword(pw, u && u.pw))) return json(res, 401, { field: "pw", error: "That password is not correct." });
    await kv("DEL", "user:" + s.email);
    await kv("DEL", "saved:" + s.uid);
    setCookie(res, SESSION_COOKIE, "", 0);
    json(res, 200, { ok: true });
  } catch (e) {
    console.error("account error", e.message);
    json(res, 502, { error: "Could not delete the account right now. Try again." });
  }
};
