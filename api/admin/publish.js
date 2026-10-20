const { CATS, SLUG_RE, json, getSession, sameOrigin, repo, gh, parseSkill, slugify } = require("../_lib");

const UNSAFE = /<\s*(script|iframe|object|embed|style)|javascript:|\son\w+\s*=/i;

// Admin only: validates a SKILL.md and commits it to skills/<slug>.md in the GitHub repo.
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!sameOrigin(req)) return json(res, 403, { error: "Forbidden" });
  try {
    const s = getSession(req);
    if (!s) return json(res, 401, { error: "Sign in with GitHub first" });
    if (!s.admin) return json(res, 403, { error: "Your GitHub account is not an authorized publisher" });

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const text = typeof body.text === "string" ? body.text : "";
    const cat = String(body.cat || "");
    if (!text.trim() || Buffer.byteLength(text) > 102400) return json(res, 400, { error: "Provide a SKILL.md under 100 KB." });
    if (CATS.indexOf(cat) < 0) return json(res, 400, { error: "Choose a valid category." });

    const p = parseSkill(text);
    if (!p.header || !p.name || !p.desc) return json(res, 400, { error: "The header block needs a name and a description." });
    if (!/^[A-Za-z0-9 -]{2,40}$/.test(p.name)) return json(res, 400, { error: "Use 2 to 40 letters, numbers, spaces or hyphens in the name." });
    if (p.desc.length > 300) return json(res, 400, { error: "Keep the description under 300 characters." });
    if (UNSAFE.test(text)) return json(res, 400, { error: "Blocked: the file contains HTML or script content that is not allowed." });
    const slug = slugify(p.name);
    if (!SLUG_RE.test(slug)) return json(res, 400, { error: "That name cannot be turned into a valid file name." });

    const r = repo();
    const path = `skills/${slug}.md`;
    const refQ = `?ref=${encodeURIComponent(r.branch)}`;
    const exists = await gh(`/repos/${r.owner}/${r.name}/contents/${path}${refQ}`);
    if (exists.status === 200) return json(res, 409, { error: "A skill with this name already exists." });
    if (exists.status !== 404) throw new Error("GitHub check failed: " + exists.status);

    const added = new Date().toISOString().slice(0, 10);
    const header = p.header.filter((l) => !/^\s*(category|added)\s*:/.test(l)).concat(["category: " + cat, "added: " + added]);
    const file = "---\n" + header.join("\n") + "\n---\n\n" + p.body.trim() + "\n";

    const put = await gh(`/repos/${r.owner}/${r.name}/contents/${path}`, {
      method: "PUT",
      body: {
        message: `Add skill: ${p.name} (published by @${s.login})`,
        content: Buffer.from(file).toString("base64"),
        branch: r.branch,
        author: { name: s.name || s.login, email: `${s.gid}+${s.login}@users.noreply.github.com` },
      },
    });
    if (put.status === 422) return json(res, 409, { error: "A skill with this name already exists." });
    if (!put.ok) throw new Error("GitHub commit failed: " + put.status);

    json(res, 201, { skill: { slug, name: p.name, desc: p.desc, cat, added }, path, commit: put.data && put.data.commit ? put.data.commit.sha : "" });
  } catch (e) {
    console.error("publish error", e.message);
    json(res, 502, { error: "Could not commit to GitHub. Check the server token and repository settings." });
  }
};
