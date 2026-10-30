import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AccessToken } from "livekit-server-sdk";
import { z } from "zod";
import { validateCloudConfig } from "../cloud-config";
import { capabilities, transcribeAudio } from "./providers";
import { languages } from "./model";
import { media as livekitService, validatedMediaUrl } from "./server";

export const guestEndpoint = "/workspace/api/sessions/guest";
export const guestIdentity = (id: string) => `workspace:guest:${id}`;
export const guestCookieName = (room: string) =>
  `syrka_guest_${room.replaceAll("-", "")}`;
const noStore = { "Cache-Control": "no-store" };
const response = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: noStore });
class GuestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function cookie(request: Request, room: string) {
  const prefix = guestCookieName(room) + "=";
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(prefix))
    ?.slice(prefix.length);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
async function rpc(
  db: SupabaseClient,
  name: string,
  values: Record<string, unknown>,
) {
  const result = await db.rpc(name, values);
  if (result.error) {
    const message = result.error.message || "Guest request failed.";
    const status = /limit|full/i.test(message)
      ? 429
      : /expired|missing/i.test(message)
        ? 401
        : /unavailable|locked|not found/i.test(message)
          ? 404
          : 403;
    throw new GuestError(
      status,
      /PGRST202|does not exist/i.test(message)
        ? "Guest admission setup is unavailable."
        : message,
    );
  }
  return result.data;
}
export async function revokeGuestMedia(
  room: string,
  guest: { user_id: string; expires_at?: string },
) {
  const horizon = Math.max(
    Math.floor(Date.now() / 1000) + 300,
    Math.floor(Date.parse(guest.expires_at || "") / 1000) || 0,
  );
  try {
    await livekitService().removeParticipant(
      `syrka-workspace-${room}`,
      guestIdentity(guest.user_id),
      { revokeTokenTs: BigInt(horizon) },
    );
  } catch (error) {
    const e = error as { status?: number; code?: string };
    if (e.status !== 404 && e.code !== "not_found")
      throw new GuestError(
        503,
        "Admission is revoked, but the media disconnect could not be confirmed. Retry Remove.",
      );
  }
}
// No Supabase Auth signup, privileged DB key or persistent Auth user is needed.
export async function guestHandler(request: Request) {
  try {
    const configError = validateCloudConfig(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
    if (configError)
      throw new GuestError(503, "Workspace guest admission is not configured.");
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const url = new URL(request.url);
    if (request.method === "POST") {
      const origin = request.headers.get("origin");
      if (
        origin &&
        origin !== url.origin &&
        !["https://www.syrka.co", "https://syrka.co"].includes(origin)
      )
        throw new GuestError(403, "Cross-site guest request rejected.");
    }
    const multipart = request.headers
      .get("content-type")
      ?.startsWith("multipart/form-data");
    if (
      (Number(request.headers.get("content-length")) || 0) >
      (multipart ? 2400000 : 16384)
    )
      throw new GuestError(413, "Guest request is too large.");
    const form = multipart ? await request.formData() : null;
    const input =
      request.method === "POST" && !form ? await request.json() : null;
    const room = z
      .uuid()
      .parse(
        form?.get("roomId") || input?.roomId || url.searchParams.get("id"),
      );
    const existing = cookie(request, room);
    if (input?.action === "request_join") {
      const ticket = existing || randomBytes(32).toString("base64url");
      const member = await rpc(db, "session_guest_request", {
        room,
        ticket,
        display: z.string().trim().min(1).max(120).parse(input.display_name),
      });
      const result = response({
        ok: true,
        admission: member.status,
        user_id: member.user_id,
      });
      result.headers.set(
        "Set-Cookie",
        `${guestCookieName(room)}=${ticket}; Path=${guestEndpoint}; Max-Age=${Math.max(0, Math.min(14400, Math.floor((Date.parse(member.expires_at) - Date.now()) / 1000)))}; HttpOnly; SameSite=Lax${url.protocol === "https:" ? "; Secure" : ""}`,
      );
      return result;
    }
    if (!existing)
      throw new GuestError(
        401,
        "Enter your name and ask the host to admit you.",
      );
    const access = (action: string, data: Record<string, unknown> = {}) =>
      rpc(db, "session_guest_access", { room, ticket: existing, action, data });
    if (request.method === "GET")
      return response({
        ...(await access("snapshot")),
        capabilities: capabilities(),
      });
    if (form) {
      if (!capabilities().stt)
        throw new GuestError(
          503,
          "Transcription is unavailable. Calling remains available.",
        );
      const audio = form.get("audio");
      if (
        !(audio instanceof Blob) ||
        audio.size > 2000000 ||
        ![
          "audio/pcm",
          "audio/webm",
          "audio/webm;codecs=opus",
          "audio/mp4",
          "audio/ogg",
          "audio/ogg;codecs=opus",
        ].includes(audio.type)
      )
        throw new GuestError(
          400,
          "Choose a supported microphone batch under 2 MB.",
        );
      const start = z.coerce.number().int().min(0).parse(form.get("start_ms"));
      const end = z.coerce
        .number()
        .int()
        .min(start + 1)
        .max(start + 60000)
        .parse(form.get("end_ms"));
      const language = z.enum(languages).parse(form.get("language"));
      const requestId = z.uuid().parse(form.get("request_id"));
      const reservation = await access("reserve_stt", {
        request_id: requestId,
        start_ms: start,
        end_ms: end,
      });
      if (!reservation.claimed) return response({ replayed: true });
      try {
        const transcript = await transcribeAudio(audio, language);
        await access("complete_stt", {
          request_id: requestId,
          text: transcript.text,
          language: transcript.language,
        });
        return response({ ok: true });
      } catch {
        await access("fail_stt", { request_id: requestId }).catch(() => {});
        throw new GuestError(
          503,
          "Speech processing could not complete, or consent ended. Calling remains available.",
        );
      }
    }
    if (input?.action === "consent") {
      await access("consent", { consent: z.boolean().parse(input.consent) });
      return response({ ok: true });
    }
    if (input?.action === "token") {
      const member = await access("token");
      if (member.status !== "approved")
        throw new GuestError(
          403,
          "The host has not admitted you, or your access was removed.",
        );
      if (!capabilities().video)
        throw new GuestError(503, "Live calling is not configured.");
      // Keep the room alive beyond this token's lifetime so revocation always
      // has an authoritative room/identity record, including before ICE joins.
      const name = `syrka-workspace-${room}`;
      const service = livekitService();
      if (!(await service.listRooms([name])).length) {
        try {
          await service.createRoom({ name, emptyTimeout: 600 });
        } catch (error) {
          if ((error as { code?: string }).code !== "already_exists")
            throw error;
        }
      }
      const ttl = Math.min(60, Math.floor((Date.parse(member.expires_at) - Date.now()) / 1000));
      if (ttl < 1) throw new GuestError(401, "Guest admission has expired.");
      const token = new AccessToken(
        process.env.LIVEKIT_API_KEY!,
        process.env.LIVEKIT_API_SECRET!,
        {
          identity: guestIdentity(member.user_id),
          name: member.display_name,
          ttl,
        },
      );
      token.addGrant({
        room: `syrka-workspace-${room}`,
        roomJoin: true,
        canSubscribe: true,
        canPublish: member.can_publish,
        canPublishData: true,
      });
      return response({
        token: await token.toJwt(),
        url: validatedMediaUrl().toString(),
      });
    }
    throw new GuestError(403, "Guests cannot perform that meeting action.");
  } catch (error) {
    if (error instanceof GuestError)
      return response({ error: error.message }, error.status);
    return response(
      {
        error:
          error instanceof z.ZodError
            ? "Check the meeting link and guest request fields."
            : "Guest admission could not complete. Try again.",
      },
      error instanceof z.ZodError ? 400 : 503,
    );
  }
}
