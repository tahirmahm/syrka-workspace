import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sessionsHandler } from "@/lib/sessions/server";
import { validateCloudConfig } from "@/lib/cloud-config";
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
  return sessionsHandler(request, { db, user, source: "workspace" }, (task) =>
    after(task),
  );
}
export { handler as GET, handler as POST };
