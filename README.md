# Skillshelf (claude_skills)

A library of Claude `SKILL.md` files. Deploys on Vercel from this GitHub repo.

```
claude_skills/
  public/        the website (index.html)
  api/           Vercel serverless functions
  skills/        one .md file per skill, written by the admin panel
  vercel.json    security headers, static output folder
```

## How it works

- **Readers** create an account on the site (name, email, password) and sign in with it. Passwords are stored only as salted scrypt hashes. Accounts and saved skills live in a small Redis database.
- Signed in users read, copy, download and save skills from `skills/*.md`. The API only returns skill text to signed in users. Saved skills follow the account. A user can delete their own account from the Saved page.
- **Admins** sign in with GitHub (Admin button). Only usernames in `ADMIN_GITHUB_USERS` are accepted. Publishing validates the file and commits it to `skills/<name>.md` through the GitHub API, credited to the admin.

## Setup

1. Push this folder to a GitHub repo named `claude_skills`.
2. **GitHub OAuth App** (admin sign in only): GitHub, Settings, Developer settings, OAuth Apps, New OAuth App.
   - Homepage URL: `https://YOUR-PROJECT.vercel.app`
   - Callback URL: `https://YOUR-PROJECT.vercel.app/api/auth/callback`
   - Copy the Client ID and generate a Client secret.
3. **Fine-grained token** (used to commit skills): GitHub, Settings, Developer settings, Fine-grained tokens, limited to the `claude_skills` repo with **Contents: Read and write**.
4. Import the repo in Vercel.
5. **Database:** in the Vercel project open Storage (Marketplace), add **Upstash for Redis** (free plan is enough) and connect it to the project. This adds the database variables automatically (`KV_REST_API_URL` and `KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; either works).
6. Add these Environment Variables:

| Name | Value |
| --- | --- |
| `GITHUB_CLIENT_ID` | OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | OAuth app client secret |
| `GITHUB_TOKEN` | fine-grained token from step 3 |
| `GITHUB_OWNER` | your GitHub username |
| `GITHUB_REPO` | `claude_skills` (default) |
| `GITHUB_BRANCH` | `main` (default) |
| `ADMIN_GITHUB_USERS` | comma separated GitHub usernames allowed to publish |
| `SESSION_SECRET` | long random string, e.g. `openssl rand -hex 32` |

7. Redeploy. Replace `yourdomain.com` in `public/index.html`, `public/robots.txt` and `public/sitemap.xml` with your vercel.app address (or custom domain).

## Notes

- Sign in is rate limited (8 tries per email and network per 15 minutes) and sign up is limited per network.
- Email addresses are not verified and there is no password reset yet, because that needs an email sending service. Add one (for example Resend) if you want those.
- Each publish is a commit, so Vercel redeploys. To skip that, set Vercel, Settings, Git, Ignored Build Step to `git diff --quiet HEAD^ HEAD -- . ':!skills'`. The site reads skills live from GitHub.
- If the repo is public, anyone can read the files on GitHub directly. Make the repo private if skills must only be visible to signed in users.
- Local testing: `npm i -g vercel`, add the variables to `.env.local`, run `vercel dev`.
