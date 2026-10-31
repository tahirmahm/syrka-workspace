import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sessionsHandler } from "../../../lib/sessions/server";
import { validateCloudConfig } from "../../../lib/cloud-config";
export const runtime = "nodejs";
export const maxDuration = 300;
async function handler(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const error = validateCloudConfig(url, key);
  if (error || !url || !key)
    return Response.json(
      { error: error || "Workspace cloud is not configured." },
      { status: 503 },
    );
  const token = request.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!token)
    return Response.json(
      { error: "Sign in to Workspace to access meetings." },
      { status: 401 },
    );
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser(token);
  if (authError || !user)
    return Response.json(
      { error: "Your Workspace session expired. Sign in again." },
      { status: 401 },
    );
  // Anonymous Auth supplies a verified identity without registration. Guests
  // may use only admission, consent, media and their own speech endpoint.
  if (user.is_anonymous) {
    const id = new URL(request.url).searchParams.get("id");
    let allowed = request.method === "GET" && !!id;
    if (request.method === "POST") {
      if ((Number(request.headers.get("content-length")) || 0) > 2400000)
        return Response.json({ error: "Request too large." }, { status: 413 });
      if (request.headers.get("content-type")?.startsWith("multipart/form-data")) allowed = true;
      else {
        const input = await request.clone().json().catch(() => null);
        allowed = ["request_join", "token", "consent"].includes(input?.action);
      }
    }
    if (!allowed) return Response.json({ error: "Guests can access only their admitted meeting. Sign in to use Workspace." }, { status: 403 });
  }
  const response = await sessionsHandler(request, { db, user, source: "workspace" }, (task) => after(task));
  if (user.is_anonymous && request.method === "GET" && response.ok) {
    const body = await response.json();
    if (body.room) return Response.json({ ...body,
      room: { ...body.room, description: "", project: "", transcript_published: false },
      segments: [], note: null, cards: [], jobs: [], annotations: null,
    }, { headers: { "Cache-Control": "no-store" } });
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  }
  return response;
}
export { handler as GET, handler as POST };
