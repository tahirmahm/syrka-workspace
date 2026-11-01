import "server-only";
import { createHmac, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
export function database(token?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw Error("Workspace cloud configuration is unavailable.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });
}
export async function account(req: Request, required = true) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) {
    if (required) throw Error("Sign in to continue.");
    return null;
  }
  const db = database(token);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) {
    if (!required) return null;
    throw Error("A verified account session is required.");
  }
  return { db, user: data.user };
}
export async function broker(
  input: Record<string, unknown>,
  rpc = "native_broker",
) {
  const key = process.env.SYRKA_NATIVE_SIGNING_KEY;
  if (!key)
    throw Error(
      "Native apps secure gateway is not configured for this deployment.",
    );
  const payload = JSON.stringify({
    ...input,
    ts: Math.floor(Date.now() / 1000),
  });
  const signature = createHmac("sha256", key).update(payload).digest("hex");
  const { data, error } = await database().rpc(rpc, {
    payload,
    signature,
  });
  if (error) throw Error(error.message);
  return data;
}
export function fingerprint(req: Request) {
  const key = process.env.SYRKA_NATIVE_SIGNING_KEY;
  if (!key) throw Error("Native apps gateway is unavailable.");
  return createHmac("sha256", key)
    .update(
      req.headers.get("x-vercel-forwarded-for") ||
        req.headers.get("x-forwarded-for") ||
        "local",
    )
    .digest("hex");
}
export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export async function rate(req: Request, scope: string) {
  await broker({ op: "rate", key: hash(scope + fingerprint(req)) });
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin)
    throw Error("Cross-origin requests are not allowed.");
  if (req.headers.get("sec-fetch-site") === "cross-site")
    throw Error("Open the form directly to submit.");
}
export function failure(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "The request failed. Please try again.";
  return Response.json(
    { error: message.slice(0, 500) },
    {
      status: /sign in|session is required/i.test(message)
        ? 401
        : /too many/i.test(message)
          ? 429
          : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
