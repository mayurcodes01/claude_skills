const crypto = require("crypto");
const { env, sign, setCookie, STATE_COOKIE } = require("../_lib");

// Starts GitHub sign in. Used by readers and by the admin.
module.exports = (req, res) => {
  try {
    const next = String(req.query.next || "");
    const safeNext = /^#\/[a-z0-9\/_-]{0,80}$/i.test(next) ? next : "";
    const state = crypto.randomBytes(16).toString("hex");
    setCookie(res, STATE_COOKIE, sign({ s: state, n: safeNext, exp: Date.now() + 10 * 60 * 1000 }), 600, "/api/auth");
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", env("GITHUB_CLIENT_ID"));
    url.searchParams.set("scope", "read:user");
    url.searchParams.set("state", state);
    res.statusCode = 302;
    res.setHeader("Location", url.toString());
    res.setHeader("Cache-Control", "no-store");
    res.end();
  } catch (e) {
    console.error("login error", e.message);
    res.statusCode = 302;
    res.setHeader("Location", "/?auth=failed");
    res.end();
  }
};
