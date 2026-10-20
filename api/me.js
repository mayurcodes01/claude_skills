const { json, getSession, repo } = require("./_lib");

module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const s = getSession(req);
    if (!s) return json(res, 200, { user: null, admin: false });
    const out = { user: { name: s.name }, admin: s.admin };
    if (s.type === "gh") out.user.login = s.login;
    if (s.admin) {
      const r = repo();
      out.repo = r.owner + "/" + r.name + " (" + r.branch + ")";
    }
    json(res, 200, out);
  } catch (e) {
    console.error("me error", e.message);
    json(res, 500, { error: "Server is not configured" });
  }
};
