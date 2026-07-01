# Security — guide, checklist & this-site assessment

_Last updated: June 29, 2026_

A practical security review for this project, plus a reusable checklist for AI-assisted / "vibe-coded" apps. Written because this is a public, AI-built site and "shipped fast" shouldn't mean "shipped unsafe."

**How to use this doc:** skim the [verdict](#tldr-verdict-for-this-site), then work top-to-bottom through the [OWASP checklist](#owasp-top-10-2025--mapped-to-this-site) and the [vibe-coding checklist](#vibe-coding--ai-app-checklist). Re-run it before any launch or big change. Boxes are pre-filled with this site's current status; update them as things change.

---

## Why this matters for AI-built apps

Building with AI is fast, but multiple 2025 studies found speed comes with a security tax:

- A scan of **100 AI-generated app repos** found **67 had at least one critical vulnerability**; **45% had hardcoded secrets** (API keys, DB URLs, JWT secrets in source) and **38% had missing authentication on sensitive API routes**.
- A **Stanford study** found developers using AI assistants produced code with **~40% more vulnerabilities** — while feeling *more* confident it was secure.
- Truffle Security found **thousands of live Google API keys** exposed on the public web, many shipped by AI codegen straight into client code.

The recurring failure modes: **exposed secrets, missing/weak auth on endpoints, IDOR (accessing other users' data by changing an id), insecure defaults, risky packages, and "nobody reviewed it."** The root cause is structural — AI writes one file at a time, loses cross-file context, and nothing tells it when an endpoint it wrote is insecure.

Much of the framing here is inspired by **Kedasha Kerr — [@itsthatlady.dev](https://www.itsthatlady.dev/mylinks/)** (ex-GitHub/Microsoft), whose "keep your vibe-coded apps safe" content is a great primer on exactly these mistakes.

---

## TL;DR verdict for this site

Good news: on the *scariest* AI-app failure modes, this project is in solid shape. A scan of the repo found **no committed secrets**, **no `.env`/key files**, identity is taken from a **Netlify-verified JWT (not a client-supplied id → no IDOR)**, inputs are **validated and size-capped**, the anonymous id is an **httpOnly cookie**, and the **repo is private**. The genuinely scary stuff (leaked keys, open sensitive endpoints, trusting the client's claimed identity) is absent.

The real gaps are configuration and hardening, not gaping holes:

| Priority | Gap | Fix |
|----------|-----|-----|
| **P1** | Missing security headers (no CSP, Referrer-Policy, Permissions-Policy, HSTS) | Add them in `netlify.toml` |
| **P2** | GitHub Action pins actions to major tags (`@v5`), not commit SHAs | Pin to full-length SHAs |
| **P2** | Anonymous `POST /api/watched-state` has no rate limit (storage/cost abuse) | Accept as low-risk, or add basic throttling |
| **P3** | No monitoring/alerting configured | Turn on Netlify notifications; skim function logs |

None are "you're about to get hacked." Nothing here handles money or sensitive personal data, which keeps the blast radius small.

---

## Threat model (what's actually at stake)

Being clear about this prevents over- or under-investing:

- **Data sensitivity: low.** Stored data is a list of match-keys + a UI setting. The only personal data is the email a user gives Netlify Identity, which **Netlify** stores and manages — not us.
- **What an attacker could plausibly want:** deface the site (via a CI/deploy or dependency compromise), run up your Netlify/Blobs usage (spam the open POST), or take over a user account (via the auth layer). Not "steal a database of PII" — there isn't one.
- **So prioritize:** integrity of the deploy pipeline (A03/A08), sane configuration (A02), and account/auth hygiene (A07) over heavy data-protection controls.

---

## OWASP Top 10 (2025) — mapped to this site

The list was refreshed for **2025** (supersedes 2021). New this edition: **Software Supply Chain Failures** (#3) and **Mishandling of Exceptional Conditions** (#10); Security Misconfiguration jumped to #2; SSRF folded into Broken Access Control.

### A01 — Broken Access Control ✅ Strong
Can a user reach data/actions that aren't theirs?
- `watched-state` keys storage by the **Netlify-verified** `user:<sub>` (signed in) or a random httpOnly cookie (guest). The function **never trusts a client-supplied user id**, and keys aren't guessable sequential ids → **no IDOR**, the #1 AI-app access bug.
- SSRF (now in this category): the function makes no user-controlled outbound requests. N/A.
- ☑︎ Action: none required. Keep deriving identity server-side from the token, never from the request body.

### A02 — Security Misconfiguration ⚠️ P1 (top gap)
- Current headers: only `X-Frame-Options` + `X-Content-Type-Options`.
- ☐ **Add**: `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` (see [Priority fixes](#priority-fixes)).
- ☑︎ Errors are generic; no stack traces leaked; no directory listing.
- Note: `index.html` source is public, but it's client code with **no secrets** — that's fine.

### A03 — Software Supply Chain Failures ⚠️ P2 (new #3)
- Third-party code loaded at runtime: Netlify Identity widget (`identity.netlify.com`), Google Fonts, YouTube iframes. A compromise upstream could inject — a scoped **CSP** limits the blast radius.
- GitHub Actions are pinned to **major tags** (`actions/checkout@v5`), which are mutable. ☐ Pin to **full commit SHAs**.
- npm deps are minimal (dev/test only). ☐ Run `npm audit` occasionally; add it to CI if you like.

### A04 — Cryptographic Failures ✅ Good
- HTTPS/TLS enforced by Netlify. ☐ Make it explicit with an **HSTS** header.
- No sensitive data at rest; secrets (`YT_API_KEY`) live in **GitHub encrypted secrets**, never in code (verified by scan).

### A05 — Injection ✅ Low risk
- The UI renders from a **developer-controlled** `DATA` object + `video_ids.json`, not user free-text. The one user-import path (restore code → base64 → JSON array of match-keys) is used only for **Set membership**, never injected into the DOM.
- Server: `watched` is validated as an array of bounded strings; Blobs is key/value (no query language to inject).
- ☑︎ Keep it this way: never `innerHTML` anything a user typed; prefer `textContent` and controlled data.

### A06 — Insecure Design ⚠️ P2
- By design, guests can `POST` without logging in (low-sensitivity convenience). There's **no rate limit**, so someone could script writes to create many blobs (junk/cost). The per-blob size cap bounds each write, but not the count.
- ☐ Decide: accept as low-risk (likely fine at this scale) **or** add lightweight throttling (e.g., per-IP/cookie) if abuse appears. Document the decision here.

### A07 — Identification & Authentication Failures ✅ Good
- Auth is delegated to **Netlify Identity** — the right call (don't roll your own sessions/password hashing). Short-lived JWT (~1h) with refresh; password/reset flows handled by the provider.
- ☑︎ Registration is open (fine for a public tracker). Revisit if you ever need to gate signups.

### A08 — Software & Data Integrity Failures ⚠️ P2
- The backfill Action **auto-commits and pushes to `main`** (triggering deploy) with `contents: write`. That permission is the minimum for its job, but it makes the Action a sensitive component.
- ☐ Pin actions to SHAs (see A03), keep the Action's scripts small and reviewed, and keep the repo private so the workflow/secrets aren't world-readable.

### A09 — Security Logging & Alerting Failures ⚠️ P3
- Netlify provides deploy + function logs; nothing custom is configured.
- ☐ Turn on **Netlify deploy/form notifications**, and skim **function logs** periodically for anomalous POST volume. Enough for this app.

### A10 — Mishandling of Exceptional Conditions ✅ Reasonable (new)
- Failures **fail safe, not open**: a Blobs read error returns empty; bad JSON → `400`; a missing/invalid token falls back to the **anonymous** cookie (never to someone else's data); the client catches fetch errors and degrades to in-memory.
- ☑︎ Action: none; keep the fail-closed pattern when adding features.

---

## Vibe-coding / AI-app checklist

The specific mistakes AI codegen makes most often. This site's status is pre-checked.

- ☑︎ **No hardcoded secrets in code or client JS** — `YT_API_KEY` is a GitHub secret; scan found none committed. _(45% of AI apps fail this.)_
- ☑︎ **No secret-bearing `.env` / key files committed** — none tracked; `.gitignore` covers `node_modules`, `.netlify`, `deno.lock`.
- ☑︎ **No API keys in the browser** — the site is static; the only key is server-side (the Action).
- ☑︎ **Auth'd data scoped server-side by verified identity** — not by a client-provided id (avoids IDOR).
- ☑︎ **Input validation on the endpoint** — type + array-length + string-length caps.
- ☑︎ **Private repo** — workflow, config, and history aren't world-readable.
- ☐ **Security headers / CSP** — partial; add them (P1).
- ☐ **Third-party/action pinning** — pin GitHub Actions to SHAs (P2).
- ☐ **Dependency check** — run `npm audit`; watch for risky/abandoned packages.
- ☑︎ **No LLM in the runtime** → prompt-injection is N/A here (relevant if you ever add an AI feature that consumes user input).
- ☑︎ **A human reviewed the security-relevant code** — this document.

---

## Priority fixes

### P1 — Security headers (`netlify.toml`)
Add to the existing `[[headers]]` block. Starter set:

```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "SAMEORIGIN"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "geolocation=(), microphone=(), camera=()"
    Strict-Transport-Security = "max-age=31536000; includeSubDomains; preload"
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline' https://identity.netlify.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https://i.ytimg.com data:; frame-src https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'self' https://identity.netlify.com; base-uri 'self'; form-action 'self'"
```

**CSP caveat (important):** the whole app is one inline `<script>` + one inline `<style>`, so the CSP above must allow `'unsafe-inline'`, which limits how much XSS protection CSP actually buys. Given the low injection surface, that's an acceptable starting point. To get a *strict* CSP later, move the inline JS/CSS into external files (or add per-block hashes/nonces) and drop `'unsafe-inline'`. Verify the values against the live site — a wrong CSP silently breaks the widget, fonts, or embeds.

### P2 — Pin GitHub Actions to commit SHAs
Replace mutable tags with full-length SHAs (and keep a comment noting the version), e.g. `uses: actions/checkout@<sha>  # v5`. Renovate/Dependabot can keep the SHAs updated.

### P2 — Anonymous write abuse
Decide and record: accept (low-risk at current scale) or add per-IP/cookie throttling. Watch function logs for spikes.

### P3 — Monitoring
Enable Netlify notifications; periodically review function/deploy logs.

---

## Going-forward practices

- **Pre-launch checklist:** run this doc's two checklists; confirm no secrets in the diff (`git diff` + a secret scanner); confirm the endpoint validates input and scopes by verified identity.
- **Secret hygiene:** secrets only in Netlify env / GitHub secrets — never in code, never echoed in logs. If one leaks, **rotate it** (regenerate the key, update the secret) rather than just deleting the commit.
- **Least privilege:** give tokens/actions the minimum scope; the backfill Action needs `contents: write` and nothing more.
- **Dependencies:** keep them few; `npm audit` before adding; prefer well-maintained packages.
- **When adding features:** anything that stores user input, adds an endpoint, or takes a new permission → re-check A01 (access control), A05 (injection), and the secrets checklist before shipping.
- **Fail closed:** on error or missing auth, default to *less* access, never more.

---

## Sources & further reading

- [OWASP Top 10:2025](https://owasp.org/Top10/2025/en/) · [What changed in 2025 (GitLab)](https://about.gitlab.com/blog/2025-owasp-top-10-whats-changed-and-why-it-matters/)
- [Kedasha Kerr — itsthatlady.dev (links)](https://www.itsthatlady.dev/mylinks/) · [@itsthatlady.dev on Instagram](https://www.instagram.com/itsthatlady.dev/)
- ["I scanned 100 AI-generated apps for security vulnerabilities" (DEV)](https://dev.to/tgoldi/i-scanned-100-ai-generated-apps-for-security-vulnerabilities-heres-what-i-found-1l5o)
- [Secure Vibe Coding Guide (Cloud Security Alliance)](https://cloudsecurityalliance.org/blog/2025/04/09/secure-vibe-coding-guide)
- [Exposed API keys from AI tools (Truffle Security context)](https://securestartkit.com/blog/exposed-api-keys-how-ai-tools-leak-your-secrets-and-how-to-lock-them-down)
