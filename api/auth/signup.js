const { json, sameOrigin, normEmail, passwordOk, hashPassword, kv, limit, clientIp, startEmailSession } = require("../_lib");

// Creates an account on this site. Passwords are stored only as salted scrypt hashes.
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!sameOrigin(req)) return json(res, 403, { error: "Forbidden" });
  try {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const name = String(b.name || "").trim();
    const email = normEmail(b.email);
    const pw = b.password;
    if (!name || name.length > 60) return json(res, 400, { field: "nm", error: "Enter your name." });
    if (!email) return json(res, 400, { field: "em", error: "Enter a valid email address." });
    if (!passwordOk(pw)) return json(res, 400, { field: "pw", error: "Use 10 to 128 characters with a letter and a number." });
    if (!(await limit("rl:su:" + clientIp(req), 10, 3600))) return json(res, 429, { field: "pw", error: "Too many sign ups from this network. Try again later." });

    const rec = JSON.stringify({ name, email, pw: await hashPassword(pw), created: new Date().toISOString() });
    const created = await kv("SET", "user:" + email, rec, "NX");
    if (!created) return json(res, 409, { field: "em", error: "An account with this email already exists. Sign in instead." });

    startEmailSession(res, email, name);
    json(res, 201, { user: { name } });
  } catch (e) {
    console.error("signup error", e.message);
    json(res, 500, { field: "pw", error: "Could not create the account right now. Try again in a moment." });
  }
};
