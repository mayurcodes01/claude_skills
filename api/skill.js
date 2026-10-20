const { json, getSession, repo, gh, parseSkill, SLUG_RE } = require("./_lib");

// One skill with its full text. Only for signed in users.
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  try {
    if (!getSession(req)) return json(res, 401, { error: "Sign in to read this skill" });
    const slug = String(req.query.slug || "");
    if (!SLUG_RE.test(slug)) return json(res, 404, { error: "Skill not found" });
    const r = repo();
    const f = await gh(`/repos/${r.owner}/${r.name}/contents/skills/${slug}.md?ref=${encodeURIComponent(r.branch)}`, { raw: true });
    if (f.status === 404) return json(res, 404, { error: "Skill not found" });
    if (!f.ok) throw new Error("GitHub read failed: " + f.status);
    const p = parseSkill(f.data);
    json(res, 200, {
      slug,
      name: p.name || slug.replace(/-/g, " "),
      desc: p.desc,
      cat: p.cat || "Other",
      added: p.added,
      body: p.body.trim(),
      raw: String(f.data).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n"),
    });
  } catch (e) {
    console.error("skill error", e.message);
    json(res, 502, { error: "Could not load this skill right now" });
  }
};
