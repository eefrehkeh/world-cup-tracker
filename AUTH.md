# Authentication — options, decisions & architecture

_Last updated: June 29, 2026_

How user accounts work in this app, why the choices were made, and how to change them. Accounts let a person's **watched matches + settings follow them across devices** instead of being tied to one browser.

Sections:

1. **[Architecture (as built)](#1--architecture-as-built)** — what's implemented and where, for anyone refactoring it.
2. **[Setup](#2--setup-one-time)** — the one-time Netlify + Google configuration.
3. **[Sign-in methods](#3--sign-in-methods)** — the menu, with trade-offs and cost.
4. **[Auth providers](#4--auth-providers)** — provider comparison + migration notes, for when we outgrow Netlify Identity.

---

## Decision log

| Date | Decision | Why |
|------|----------|-----|
| 2026-06-29 | **Provider: Netlify Identity** | Native to the existing Netlify stack; least new code; keeps the Function + Blobs storage. Un-deprecated by Netlify Feb 2026. |
| 2026-06-29 | **Methods: Google + email/password** | The two Netlify Identity methods with broad consumer reach; Google one-tap for most, email/password as the inclusive fallback. |
| 2026-06-29 | **Anonymous guest stays the default** | First-time visitors need zero setup; accounts are an opt-in upgrade for cross-device sync. |
| 2026-06-29 | **Storage unchanged** | Keep Netlify Blobs; only the *key* changes (user vs cookie). No DB migration. |

---

## 1 — Architecture (as built)

### Pieces

- **`index.html`** (client)
  - Loads the Netlify Identity widget (`<script src="https://identity.netlify.com/v1/netlify-identity-widget.js">` in `<head>`).
  - **`#authRow`** — the "Sign in to sync" control; hidden unless the widget is available.
  - Auth JS: `initAuth`, `authReady`, `authHeaders`, `currentSettings`, `applySyncedSettings`, `updateAuthUI`, `onAuthLogin`, `onAuthLogout`.
  - Settings apply-helper split out so it can be re-applied after login without rebinding the click handler: `applyWatchedFilterPref`.
  - `loadWatchedState` / `saveWatchedState` send the Identity bearer token when signed in.
- **`netlify/functions/watched-state.mts`** (server) — GET/POST at `/api/watched-state`; reads/writes Netlify Blobs; keys by user or cookie.

### Storage model

- **Store**: Netlify Blobs store `watched-state`.
- **Key**: `user:<identity-sub>` when a verified Identity bearer token is present, else the anonymous `wc26_vid` cookie UUID.
- **Value**: `{ watched: string[], settings: { watchedFilter? }, updatedAt: string }`.
- **Caps** (server-enforced): ≤ 200 match-keys, each ≤ 120 chars; settings limited to known keys with values ≤ 20 chars.

### Request flow

1. Client `GET /api/watched-state` with `Authorization: Bearer <jwt>` when signed in. Netlify **verifies the token and populates `context.clientContext.user`**; the function returns that user's `{watched, settings}`. No token → the cookie visitor's data.
2. Client `POST` (debounced ~500ms) sends `{ watched, settings }` + the bearer header; the function stores it under the same key.
3. The token comes from `netlifyIdentity.currentUser().jwt()`, which auto-refreshes if expired (~1h lifetime). The function never verifies signatures itself — Netlify's infra does that before populating `clientContext.user`.

### Auth lifecycle (client)

- **`initAuth()`** wires widget events and the button:
  - `init` → if a session is restored, load that account's state.
  - `login` → **`onAuthLogin`**: union this device's current watched set into the account (so a guest's progress isn't lost), then save the union.
  - `logout` → **`onAuthLogout`**: reload the anonymous (cookie) state.
  - Button → `netlifyIdentity.open()` when logged out, `logout()` when logged in.
- **Settings sync** is two-way: signed-in loads apply the account's settings via `applySyncedSettings`; toggling the watched-only filter while signed in schedules a save so the change propagates.

### Graceful degradation

If the widget script is blocked, Identity isn't enabled, or the API is unreachable (e.g. opening `index.html` from disk), `authReady()` is false → the auth row stays hidden and the app runs in the original anonymous-cookie mode. Nothing breaks pre-setup.

### Security notes

- Match-key strings are low-sensitivity; there's no PII in the store.
- Trust model: Netlify verifies the Identity JWT, so the function trusts `context.clientContext.user.sub`. The server still caps array/string sizes to bound abuse.
- **Caveat to confirm in production**: that v2 Functions populate `context.clientContext.user` on this site. Test = sign in on two browsers with one account and confirm the watched list syncs. If it doesn't, switch the function to the legacy handler signature (which exposes `context.clientContext` reliably) — the rest of the design is unchanged.

### How to extend / refactor

- **Add an OAuth provider Netlify Identity already supports** (GitHub/GitLab/Bitbucket): enable it in the Netlify dashboard — no code change (the widget renders it).
- **Add a new synced setting**: add its key to `ALLOWED_SETTING_KEYS` in the function, include it in `currentSettings()`, and apply it in `applySyncedSettings()`.
- **Add Apple / magic-link / passkeys**: not available on Netlify Identity — requires a provider switch (see §4). The storage layer, the merge, and the settings sync are all reusable; only the login widget and how the function identifies the user would change.

---

## 2 — Setup (one-time)

**Netlify dashboard** (Site configuration → Identity):

1. **Enable Identity.**
2. **Registration**: Open (or Invite-only to keep it private).
3. **External providers → Google**: use Netlify's default credentials to test instantly, or your own (below). Email/password is on by default; Netlify sends confirmation/reset emails.

**Your own Google OAuth credentials** (optional — removes Netlify's name from the consent screen, owns the rate limits). Reuse the **same Google Cloud project** as the YouTube API key; an API key and an OAuth client are independent credential types and don't conflict.

1. **Consent screen** (Google Auth Platform → Branding): type **External**; app name + support email; default scopes (`email`, `profile`, `openid`) — nothing extra. **Publish** it (basic scopes need no Google review). Add `netlify.com` to **Authorized domains**.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
3. **Authorized redirect URI**: `https://api.netlify.com/auth/done` (use whatever Netlify's "use your own credentials" dialog shows).
4. Paste the **Client ID + secret** into Netlify's Google provider dialog.

No extra Google API needs enabling for sign-in.

---

## 3 — Sign-in methods

### Quick comparison

| Method | Login friction | Phishing-resistant | Setup effort | Direct cost | On Netlify Identity? |
|--------|----------------|--------------------|--------------|-------------|----------------------|
| Email + password | Medium | ❌ | Low | Free | ✅ (in use) |
| Google OAuth | Very low | ⚠️ partial | Low–Med | Free | ✅ (in use) |
| GitHub / GitLab / Bitbucket | Low | ⚠️ partial | Low | Free | ✅ |
| Email magic link | Low | ⚠️ partial | Medium | Free (email) | ❌ |
| Apple Sign-In | Very low | ⚠️ partial | Med–High | **$99/yr** | ❌ |
| Facebook / Microsoft | Low | ⚠️ partial | Medium | Free | ❌ |
| Phone / SMS OTP | Low | ❌ (SIM-swap) | Medium | **~$0.01–0.11/code** | ❌ |
| Passkeys (WebAuthn) | Very low | ✅ (strongest) | High | Free | ❌ |
| Enterprise SSO (SAML/OIDC) | Low | ✅ | High | Paid | ❌ |
| Anonymous / guest | None | n/a | In use | Free | ✅ (default) |

"⚠️ partial": resistant to password reuse/leaks, but a convincing fake login page or OAuth-consent phish can still fool users. Only passkeys are inherently phishing-resistant.

### Method-by-method

**Email + password** _(in use)_ — universal, no third party, works for everyone; but you inherit resets, breaches, reuse, and support. Netlify Identity provides it (and the emails) out of the box.

**Google OAuth** _(in use)_ — ~everyone has an account; one tap; highest consumer conversion. Depends on Google and needs a consent-screen setup. Best single choice for this app.

**GitHub / GitLab / Bitbucket** — frictionless for *developers*; general/sports audiences mostly don't have or reach for them. Available on Netlify Identity if ever wanted.

**Email magic link (passwordless)** — emailed one-time link; no passwords (Slack/Notion/Substack model). Needs fast, deliverable email; a login detours to the inbox. ❌ on Netlify Identity.

**Apple Sign-In** — privacy-friendly, one tap on Apple devices; **required by Apple if you ship an iOS app with other social logins** (not for a pure website). Needs the **$99/yr** Apple Developer Program and fiddlier config. ❌ on Netlify Identity.

**Facebook / Microsoft** — Facebook for broad consumer reach (declining, privacy baggage); Microsoft skews enterprise. ❌ on Netlify Identity.

**Phone / SMS OTP** — great mobile-first / doubles as 2FA, but **costs money per code** (~$0.01 US to ~$0.11 India; ~$0.05/verify via Twilio Verify) and is **SIM-swap-vulnerable**; NIST discourages SMS as a sole factor. Not worth it for a free tracker. ❌ on Netlify Identity.

**Passkeys (WebAuthn/FIDO2)** — the industry direction (~5B in use in 2026), phishing-resistant, ~3× faster; but cross-ecosystem sync is uneven, the term confuses users, and it's best deployed **hybrid** with a fallback. Strong later upgrade via a different provider. ❌ on Netlify Identity.

**Enterprise SSO (SAML/OIDC)** — B2B only; not relevant to a public sports tracker. ❌ on Netlify Identity.

**Anonymous / guest** _(default)_ — the per-browser cookie; kept so first-time visitors need zero setup and accounts are an opt-in upgrade.

---

## 4 — Auth providers

Reference for when we want capability Netlify Identity can't give. All free tiers below comfortably cover this app.

| Provider | Free tier | Unlocks | Storage | Best when |
|----------|-----------|---------|---------|-----------|
| **Netlify Identity** _(in use)_ | Free on current Netlify plans (historically ~1k MAU — verify) | Email/pw, Google, GitHub, GitLab, Bitbucket | Keep Function + Blobs | Least work; already on Netlify |
| **Supabase Auth** | 50k MAU | + magic link, OTP, **Apple**, **passkeys**, anonymous | Postgres (or keep Blobs) | More methods + a real DB; future-proofing |
| **Firebase Auth** | 50k MAU | + **Apple**, phone (paid) | Firestore | Already in Google/Firebase |
| **Auth0** | Generous (verify) | Everything incl. SSO, **passkeys**, MFA | Bring your own | Enterprise-grade; Netlify's named successor to Identity |
| **Clerk** | ~10k MAU (verify) | **passkeys**, magic link, social, prebuilt UI | Bring your own | Slickest drop-in UI (React-first) |

### Migration notes (moving off Netlify Identity later)

- **Storage is portable.** Watched-state lives in Netlify Blobs keyed by user id. Switching providers means: (1) swap the login widget, (2) change how the function identifies the user (Netlify Identity context → verify the new provider's JWT), (3) keep the same Blobs key strategy. The data doesn't move.
- **Account continuity.** If users already have Netlify Identity accounts, re-link on verified email so history carries over.
- **Reuse the merge.** The anonymous→account union in `onAuthLogin` is provider-agnostic.
- **Supabase gotcha**: free projects pause after ~1 week idle — a periodic ping (or the backfill Action's traffic) keeps it warm.
