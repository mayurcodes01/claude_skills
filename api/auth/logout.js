const { json, sameOrigin, setCookie, SESSION_COOKIE } = require("../_lib");

module.exports = (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!sameOrigin(req)) return json(res, 403, { error: "Forbidden" });
  setCookie(res, SESSION_COOKIE, "", 0);
  res.setHeader("Cache-Control", "no-store");
  json(res, 200, { ok: true });
};
