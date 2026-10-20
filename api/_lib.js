// Shared helpers for the Skillshelf API. Files starting with "_" are not exposed as routes.
const crypto = require("crypto");

const SESSION_COOKIE = "ss_session";
const STATE_COOKIE = "ss_state";
const CATS = ["Documents", "Data", "Design", "Developer", "Writing"];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,60}$/;

function env(name, fallback) {
  const v = process.env[name];
  if (v) return v;
  if (fallback !== undefined) return fallback;
  throw new Error("Missing environment variable " + name);
}

function repo() {
  return {
    owner: env("GITHUB_OWNER"),
    name: env("GITHUB_REPO", "claude_skills"),
    branch: env("GITHUB_BRANCH", "main"),
  };
}

function hmac(body) {
  return crypto.createHmac("sha256", env("SESSION_SECRET")).update(body).digest("base64url");
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return body + "." + hmac(body);
}

function verify(token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [body, sig] = token.split(".");
  const want = Buffer.from(hmac(body));
  const got = Buffer.from(sig || "");
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p && p.exp > Date.now() ? p : null;
  } catch (e) {
    return null;
  }
}

function readCookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function setCookie(res, name, value, maxAgeSeconds, path) {
  const c = `${name}=${encodeURIComponent(value)}; Path=${path || "/"}; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
  res.setHeader("Set-Cookie", [].concat(res.getHeader("Set-Cookie") || [], c));
}

function adminList() {
  return String(process.env.ADMIN_GITHUB_USERS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminLogin(login) {
  return adminList().includes(String(login).toLowerCase());
}

// Two kinds of session: "em" (account created on this site) and "gh" (GitHub, publishers only).
// Returns { uid, type, name, login?, email?, gid?, admin } or null. Admin is re-checked on every request.
function getSession(req) {
  const p = verify(readCookies(req)[SESSION_COOKIE]);
  if (!p || !p.id || (p.t !== "em" && p.t !== "gh")) return null;
  if (p.t === "gh") {
    if (!isAdminLogin(p.login)) return null;
    return { uid: p.id, type: "gh", login: p.login, name: p.name, gid: p.gid, admin: true };
  }
  return { uid: p.id, type: "em", email: p.email, name: p.name, admin: false };
}

const WEEK = 7 * 24 * 60 * 60;

function startEmailSession(res, email, name) {
  setCookie(res, SESSION_COOKIE, sign({ t: "em", id: "em:" + email, email, name, exp: Date.now() + WEEK * 1000 }), WEEK);
}

function normEmail(v) {
  const e = String(v || "").trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : "";
}

function passwordOk(pw) {
  return typeof pw === "string" && pw.length >= 10 && pw.length <= 128 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
}

function clientIp(req) {
  return (String(req.headers["x-forwarded-for"] || "").split(",")[0] || "").trim() || "unknown";
}

// Password hashing: scrypt with a random 16 byte salt, stored as "salt:hash" (hex).
const scrypt = (pw, salt) => new Promise((resolve, reject) => crypto.scrypt(pw, salt, 64, (e, k) => (e ? reject(e) : resolve(k))));

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return salt.toString("hex") + ":" + (await scrypt(pw, salt)).toString("hex");
}

// With no stored hash it still does the same work, so a missing account takes as long as a wrong password.
async function checkPassword(pw, stored) {
  const parts = String(stored || "").split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    await scrypt(pw, Buffer.alloc(16));
    return false;
  }
  const got = await scrypt(pw, Buffer.from(parts[0], "hex"));
  const want = Buffer.from(parts[1], "hex");
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

// Redis over HTTPS (Upstash, added from the Vercel Marketplace). Accepts either variable naming.
async function kv(...cmd) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) throw new Error("Missing database settings");
  const r = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error("Database error " + (d.error || r.status));
  return d.result;
}

// Returns true while the caller is still under the limit.
async function limit(key, max, windowSeconds) {
  const n = await kv("INCR", key);
  if (n === 1) await kv("EXPIRE", key, windowSeconds);
  return n <= max;
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(data));
}

// Reject cross-site POSTs. Browsers always send Origin on same-origin POST fetches.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host === (req.headers["x-forwarded-host"] || req.headers.host);
  } catch (e) {
    return false;
  }
}

async function gh(path, options) {
  const opts = options || {};
  const res = await fetch("https://api.github.com" + path, {
    method: opts.method || "GET",
    headers: Object.assign(
      {
        Accept: opts.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
        Authorization: "Bearer " + env("GITHUB_TOKEN"),
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "skillshelf",
      },
      opts.body ? { "Content-Type": "application/json" } : {}
    ),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data = text;
  if (!opts.raw) {
    try { data = JSON.parse(text); } catch (e) { data = null; }
  }
  return { status: res.status, ok: res.ok, data };
}

function parseSkill(raw) {
  const text = String(raw).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const o = { name: "", desc: "", cat: "", added: "", body: text, header: null };
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (m) {
    o.body = m[2];
    o.header = m[1].split("\n");
    o.header.forEach((l) => {
      const i = l.indexOf(":");
      if (i <= 0) return;
      const k = l.slice(0, i).trim();
      const v = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k === "name") o.name = v;
      else if (k === "description") o.desc = v;
      else if (k === "category") o.cat = v;
      else if (k === "added") o.added = v;
    });
  }
  return o;
}

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

module.exports = {
  CATS, SLUG_RE, SESSION_COOKIE, STATE_COOKIE,
  env, repo, sign, verify, readCookies, setCookie, getSession, json, sameOrigin, gh, parseSkill, slugify,
  WEEK, isAdminLogin, startEmailSession, normEmail, passwordOk, clientIp, hashPassword, checkPassword, kv, limit,
};
