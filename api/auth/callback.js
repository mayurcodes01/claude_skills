const crypto = require("crypto");
const { env, sign, verify, readCookies, setCookie, isAdminLogin, SESSION_COOKIE, STATE_COOKIE } = require("../_lib");

function back(res, location) {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

module.exports = async (req, res) => {
  const fail = () => {
    setCookie(res, STATE_COOKIE, "", 0, "/api/auth");
    back(res, "/?auth=failed");
  };
  try {
    const st = verify(readCookies(req)[STATE_COOKIE]);
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    if (!st || !code || state.length !== st.s.length) return fail();
    if (!crypto.timingSafeEqual(Buffer.from(state), Buffer.from(st.s))) return fail();

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "skillshelf" },
      body: JSON.stringify({ client_id: env("GITHUB_CLIENT_ID"), client_secret: env("GITHUB_CLIENT_SECRET"), code }),
    });
    const tok = await tokenRes.json();
    if (!tok.access_token) return fail();

    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: "Bearer " + tok.access_token, Accept: "application/vnd.github+json", "User-Agent": "skillshelf" },
    });
    if (!userRes.ok) return fail();
    const u = await userRes.json();
    if (!u || !u.login || !u.id) return fail();

    // GitHub sign in is for publishers only. Readers use accounts created on the site.
    if (!isAdminLogin(u.login)) {
      setCookie(res, STATE_COOKIE, "", 0, "/api/auth");
      return back(res, "/?auth=denied");
    }
    // The GitHub token is used once to read the profile and is then discarded.
    const week = 7 * 24 * 60 * 60;
    setCookie(res, SESSION_COOKIE, sign({ t: "gh", id: "gh:" + u.login, login: u.login, name: u.name || u.login, gid: u.id, exp: Date.now() + week * 1000 }), week);
    setCookie(res, STATE_COOKIE, "", 0, "/api/auth");
    back(res, "/" + (st.n || ""));
  } catch (e) {
    console.error("callback error", e.message);
    fail();
  }
};
