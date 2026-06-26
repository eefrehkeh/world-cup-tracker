import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const COOKIE_NAME = "wc26_vid";
const STORE_NAME = "watched-state";
const MAX_MATCH_KEYS = 200; // generous cap — there are only 71+32 matches total
const MAX_KEY_LENGTH = 120;

function getOrCreateVisitorId(req: Request): { visitorId: string; isNew: boolean } {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([a-zA-Z0-9_-]+)`));
  if (match && match[1]) {
    return { visitorId: match[1], isNew: false };
  }
  // crypto.randomUUID is available in the Netlify Functions runtime
  const visitorId = crypto.randomUUID();
  return { visitorId, isNew: true };
}

function setCookieHeader(visitorId: string): string {
  // 1 year, site-wide, not readable by client JS isn't required here (no sensitive data),
  // but httpOnly is good hygiene since the ID itself doesn't need to be read by the page.
  const oneYear = 60 * 60 * 24 * 365;
  return `${COOKIE_NAME}=${visitorId}; Path=/; Max-Age=${oneYear}; SameSite=Lax; HttpOnly; Secure`;
}

function isValidMatchKeyArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  if (value.length > MAX_MATCH_KEYS) return false;
  return value.every(
    (item) => typeof item === "string" && item.length > 0 && item.length <= MAX_KEY_LENGTH
  );
}

export default async (req: Request, context: Context) => {
  const store = getStore(STORE_NAME);
  const { visitorId, isNew } = getOrCreateVisitorId(req);

  if (req.method === "GET") {
    let watched: string[] = [];
    try {
      const stored = await store.get(visitorId, { type: "json" });
      if (stored && isValidMatchKeyArray(stored.watched)) {
        watched = stored.watched;
      }
    } catch {
      // no saved data yet for this visitor — that's fine, return empty
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (isNew) headers["Set-Cookie"] = setCookieHeader(visitorId);

    return new Response(JSON.stringify({ watched }), { status: 200, headers });
  }

  if (req.method === "POST") {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
    }

    const watched = (body as { watched?: unknown })?.watched;
    if (!isValidMatchKeyArray(watched)) {
      return new Response(
        JSON.stringify({ error: "`watched` must be an array of match-key strings" }),
        { status: 400 }
      );
    }

    await store.setJSON(visitorId, { watched, updatedAt: new Date().toISOString() });

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (isNew) headers["Set-Cookie"] = setCookieHeader(visitorId);

    return new Response(JSON.stringify({ ok: true, count: watched.length }), {
      status: 200,
      headers,
    });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/watched-state",
};
