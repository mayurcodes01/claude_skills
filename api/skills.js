const { json, repo, gh, parseSkill, SLUG_RE } = require("./_lib");

// Public listing: name, description, category and date only. Skill bodies need a signed in user (see skill.js).
let cache = { t: 0, data: null };

async function loadAll() {
  const r = repo();
  const dir = await gh(`/repos/${r.owner}/${r.name}/contents/skills?ref=${encodeURIComponent(r.branch)}`);
  if (dir.status === 404) return [];
  if (!dir.ok || !Array.isArray(dir.data)) throw new Error("GitHub list failed: " + dir.status);
  const files = dir.data.filter((f) => f.type === "file" && f.name.endsWith(".md") && SLUG_RE.test(f.name.slice(0, -3))).slice(0, 200);
  const items = await Promise.all(
    files.map(async (f) => {
      const res = await gh(`/repos/${r.owner}/${r.name}/contents/${f.path}?ref=${encodeURIComponent(r.branch)}`, { raw: true });
      if (!res.ok) return null;
      const p = parseSkill(res.data);
      const slug = f.name.slice(0, -3);
      return { slug, name: p.name || slug.replace(/-/g, " "), desc: p.desc, cat: p.cat || "Other", added: p.added };
    })
  );
  return items.filter(Boolean).sort((a, b) => (b.added || "").localeCompare(a.added || "") || a.name.localeCompare(b.name));
}

module.exports = async (req, res) => {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  try {
    if (!cache.data || Date.now() - cache.t > 15000) {
      cache = { t: Date.now(), data: await loadAll() };
    }
    res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=30");
    json(res, 200, { skills: cache.data });
  } catch (e) {
    console.error("skills error", e.message);
    json(res, 502, { error: "Could not load skills right now" });
  }
};
