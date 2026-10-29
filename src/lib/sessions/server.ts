import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { z } from "zod";
import {
  roomInput,
  notesSchema,
  languages,
  nextReview,
  type SessionSource,
  type SessionRoom,
  type Segment,
  type Member,
} from "./model";
import {
  capabilities,
  generateNotes,
  runIntelligence,
  transcribeAudio,
} from "./providers";
import { parseTranscript } from "./transcripts";
export type SessionContext = {
  db: SupabaseClient;
  user: { id: string };
  source: SessionSource;
};
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function check<T extends { error: unknown }>(result: T) {
  if (result.error) {
    const error = result.error as { message?: string; code?: string };
    if (error.code === "PGRST205" || error.code === "42P01")
      throw new HttpError(503, "Sessions database migration is not installed.");
    throw new HttpError(
      400,
      error.message || "The request could not be completed.",
    );
  }
  return result;
}
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function roomFor(ctx: SessionContext, id: string) {
  z.uuid().parse(id);
  const result = check(
    await ctx.db.from("session_rooms").select("*").eq("id", id).maybeSingle(),
  );
  if (!result.data)
    throw new HttpError(
      404,
      "Session not found or access has not been granted.",
    );
  return result.data as SessionRoom;
}
function host(ctx: SessionContext, room: SessionRoom) {
  if (room.owner_id !== ctx.user.id)
    throw new HttpError(403, "Only the host can do that.");
}
function media() {
  if (!capabilities().video)
    throw new HttpError(503, "LiveKit is not configured.");
  const url = new URL(process.env.LIVEKIT_URL!);
  if (
    !["wss:", "https:"].includes(url.protocol) &&
    process.env.NODE_ENV === "production"
  )
    throw new HttpError(503, "LiveKit requires a secure URL.");
  url.protocol =
    url.protocol === "wss:"
      ? "https:"
      : url.protocol === "ws:"
        ? "http:"
        : url.protocol;
  return new RoomServiceClient(
    url.toString(),
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
  );
}
const mediaRoom = (ctx: SessionContext, id: string) =>
  `syrka-${ctx.source}-${id}`;
export async function sessionsHandler(
  request: Request,
  ctx: SessionContext,
  defer: (task: () => Promise<void>) => void,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (request.method === "GET") {
      const search = url.searchParams.get("q");
      if (search !== null) {
        const q = z.string().trim().min(2).max(200).parse(search);
        const hits = check(await ctx.db.rpc("session_search", { q }));
        return json({ results: hits.data });
      }
      const id = url.searchParams.get("id");
      if (!id) {
        let query = ctx.db
          .from("session_rooms")
          .select("*")
          .order("starts_at", { ascending: false })
          .limit(200);
        const offering = url.searchParams.get("offering");
        if (offering) query = query.eq("offering_id", z.uuid().parse(offering));
        const rooms = check(await query);
        return json({
          rooms: rooms.data,
          capabilities: capabilities(),
          user_id: ctx.user.id,
        });
      }
      const room = await roomFor(ctx, id);
      const [members, segments, note, jobs, cards, annotations] =
        await Promise.all([
          ctx.db.from("session_members").select("*").eq("room_id", id),
          ctx.db
            .from("session_segments")
            .select("*")
            .eq("room_id", id)
            .gte(
              "created_at",
              url.searchParams.get("after") ||
                new Date(
                  Date.now() - room.retention_days * 86400000,
                ).toISOString(),
            )
            .order("start_ms")
            .limit(2000),
          ctx.db
            .from("session_notes")
            .select("*")
            .eq("room_id", id)
            .maybeSingle(),
          ctx.db
            .from("session_jobs")
            .select("*")
            .eq("room_id", id)
            .eq("actor_id", ctx.user.id)
            .order("created_at", { ascending: false })
            .limit(20),
          ctx.db
            .from("session_cards")
            .select("*")
            .eq("room_id", id)
            .eq("user_id", ctx.user.id)
            .order("due_at")
            .limit(200),
          ctx.db
            .from("session_annotations")
            .select("*")
            .eq("room_id", id)
            .eq("user_id", ctx.user.id)
            .maybeSingle(),
        ]);
      [members, segments, note, jobs, cards, annotations].forEach(check);
      return json({
        room,
        members: members.data,
        me: members.data?.find((m) => m.user_id === ctx.user.id) || null,
        segments: segments.data,
        note: note.data,
        jobs: jobs.data,
        cards: cards.data,
        annotations: annotations.data,
        user_id: ctx.user.id,
        capabilities: capabilities(),
      });
    }
    const origin = request.headers.get("origin");
    if (
      origin &&
      origin !== url.origin &&
      !["https://syrka.co", "https://www.syrka.co"].includes(origin)
    )
      throw new HttpError(403, "Cross-site request rejected.");
    if ((Number(request.headers.get("content-length")) || 0) > 2400000)
      throw new HttpError(413, "Request too large.");
    if (request.headers.get("content-type")?.startsWith("multipart/form-data"))
      return await speechRequest(request, ctx);
    const input = await request.json();
    const action = z.string().max(40).parse(input.action);
    if (action === "create") {
      const data = roomInput.parse(input.data);
      if (
        ctx.source === "workspace" &&
        (data.institution_id || data.offering_id)
      )
        throw new HttpError(
          400,
          "Academic sessions must be created through Campus.",
        );
      if (
        ctx.source === "campus" &&
        (!data.institution_id || !data.offering_id)
      )
        throw new HttpError(400, "Select a Campus course offering.");
      try {
        Intl.DateTimeFormat("en", { timeZone: data.timezone });
      } catch {
        throw new HttpError(400, "Choose a valid IANA time zone.");
      }
      const rooms = [];
      for (
        let i = 0;
        i < (data.recurrence === "weekly" ? data.occurrences : 1);
        i++
      ) {
        const date = new Date(data.starts_at);
        date.setUTCDate(date.getUTCDate() + i * 7);
        rooms.push({
          owner_id: ctx.user.id,
          title: data.title,
          description: data.description,
          starts_at: date.toISOString(),
          timezone: data.timezone,
          kind: ctx.source === "campus" ? "lecture" : data.kind,
          institution_id: data.institution_id,
          offering_id: data.offering_id,
          project: data.project,
        });
      }
      const result = check(
        await ctx.db.from("session_rooms").insert(rooms).select("*"),
      );
      return json({ rooms: result.data }, 201);
    }
    const id = z.uuid().parse(input.roomId);
    if (action === "request_join") {
      check(
        await ctx.db.rpc("session_request_join", {
          room: id,
          display: z.string().trim().min(1).max(120).parse(input.display_name),
        }),
      );
      return json({ ok: true });
    }
    const room = await roomFor(ctx, id);
    if (action === "consent") {
      check(
        await ctx.db.rpc("session_set_consent", {
          room: id,
          consent: z.boolean().parse(input.consent),
        }),
      );
      return json({ ok: true });
    }
    if (action === "token") {
      if (room.status === "ended")
        throw new HttpError(409, "This session has ended.");
      const member = check(
        await ctx.db
          .from("session_members")
          .select("*")
          .eq("room_id", id)
          .eq("user_id", ctx.user.id)
          .single(),
      ).data as Member;
      if (member.status !== "approved")
        throw new HttpError(403, "Waiting for the host to admit you.");
      if (!capabilities().video)
        throw new HttpError(503, "Live calling is not configured.");
      const token = new AccessToken(
        process.env.LIVEKIT_API_KEY!,
        process.env.LIVEKIT_API_SECRET!,
        {
          identity: `${ctx.source}:${ctx.user.id}`,
          name: member.display_name,
          ttl: 60,
        },
      );
      token.addGrant({
        room: mediaRoom(ctx, id),
        roomJoin: true,
        canSubscribe: true,
        canPublish: member.can_publish,
        canPublishData: true,
      });
      return json({ token: await token.toJwt(), url: process.env.LIVEKIT_URL });
    }
    if (action === "host_update") {
      host(ctx, room);
      const patch = z
        .object({
          title: z.string().min(1).max(160).optional(),
          description: z.string().max(4000).optional(),
          locked: z.boolean().optional(),
          status: z.enum(["scheduled", "live", "ended"]).optional(),
          transcribing: z.boolean().optional(),
          transcript_published: z.boolean().optional(),
          retention_days: z.number().int().min(1).max(365).optional(),
        })
        .strict()
        .parse(input.patch);
      if (patch.transcribing && !capabilities().stt)
        throw new HttpError(503, "Speech recognition is not configured.");
      if (patch.status === "ended" && capabilities().video) {
        try {
          await media().deleteRoom(mediaRoom(ctx, id));
        } catch (e) {
          if (!(e instanceof Error && /not found/i.test(e.message)))
            throw new HttpError(
              503,
              "The media room could not be ended. Try again.",
            );
        }
        patch.transcribing = false;
        patch.locked = true;
      }
      check(await ctx.db.from("session_rooms").update(patch).eq("id", id));
      return json({ ok: true });
    }
    if (action === "member_update") {
      host(ctx, room);
      const userId = z.uuid().parse(input.user_id);
      if (userId === room.owner_id)
        throw new HttpError(400, "Host permissions cannot be changed here.");
      const patch = z
        .object({
          status: z.enum(["approved", "removed"]).optional(),
          can_publish: z.boolean().optional(),
        })
        .strict()
        .parse(input.patch);
      if (capabilities().video) {
        try {
          if (patch.status === "removed")
            await media().removeParticipant(
              mediaRoom(ctx, id),
              `${ctx.source}:${userId}`,
            );
          else if (patch.can_publish !== undefined)
            await media().updateParticipant(
              mediaRoom(ctx, id),
              `${ctx.source}:${userId}`,
              {
                permission: {
                  canPublish: patch.can_publish,
                  canSubscribe: true,
                  canPublishData: true,
                },
              },
            );
        } catch (e) {
          if (!(e instanceof Error && /not found/i.test(e.message)))
            throw new HttpError(
              503,
              "Live participant permissions could not be updated.",
            );
        }
      }
      check(
        await ctx.db
          .from("session_members")
          .update(patch)
          .eq("room_id", id)
          .eq("user_id", userId),
      );
      return json({ ok: true });
    }
    if (action === "import") {
      host(ctx, room);
      if (input.confirmed !== true)
        throw new HttpError(
          400,
          "Confirm that you may import this transcript.",
        );
      const entries = parseTranscript(
        z.string().max(1000000).parse(input.text),
        z.enum(["srt", "vtt", "txt"]).parse(input.format),
      );
      if (!entries.length)
        throw new HttpError(400, "No transcript segments found.");
      for (let i = 0; i < entries.length; i += 100)
        check(
          await ctx.db
            .from("session_segments")
            .insert(
              entries.slice(i, i + 100).map((e) => ({ ...e, room_id: id })),
            ),
        );
      return json({ count: entries.length });
    }
    if (action === "edit_segment") {
      host(ctx, room);
      check(
        await ctx.db
          .from("session_segments")
          .update(
            z
              .object({
                edited_text: z.string().max(16000).nullable().optional(),
                important: z.boolean().optional(),
              })
              .strict()
              .parse(input.patch),
          )
          .eq("room_id", id)
          .eq("id", z.uuid().parse(input.segment_id)),
      );
      return json({ ok: true });
    }
    if (action === "save_note") {
      host(ctx, room);
      const body = notesSchema.parse(input.body);
      const refs = check(
        await ctx.db.from("session_segments").select("*").eq("room_id", id),
      ).data as Segment[];
      const { validateReferences } = await import("./model");
      validateReferences(body, refs);
      check(
        await ctx.db.from("session_notes").upsert({
          room_id: id,
          body,
          published: z.boolean().parse(input.published),
          ai_generated: input.ai_generated === true,
          updated_at: new Date().toISOString(),
        }),
      );
      return json({ ok: true });
    }
    if (action === "annotate") {
      check(
        await ctx.db.from("session_annotations").upsert(
          {
            room_id: id,
            user_id: ctx.user.id,
            ...z
              .object({
                body: z.string().max(12000),
                bookmarked: z.boolean(),
                folder: z.string().max(120),
              })
              .parse(input.data),
          },
          { onConflict: "room_id,user_id" },
        ),
      );
      return json({ ok: true });
    }
    if (action === "card") {
      const card = z
        .object({
          front: z.string().min(1).max(1500),
          back: z.string().min(1).max(4000),
          segment_ids: z.array(z.uuid()).max(30),
        })
        .parse(input.data);
      check(
        await ctx.db
          .from("session_cards")
          .insert({ ...card, room_id: id, user_id: ctx.user.id }),
      );
      return json({ ok: true });
    }
    if (action === "review_card") {
      const card = check(
        await ctx.db
          .from("session_cards")
          .select("*")
          .eq("id", z.uuid().parse(input.card_id))
          .eq("room_id", id)
          .eq("user_id", ctx.user.id)
          .single(),
      ).data;
      const confidence = z.number().int().min(0).max(3).parse(input.confidence);
      check(
        await ctx.db
          .from("session_cards")
          .update({ confidence, ...nextReview(confidence, card.interval_days) })
          .eq("id", card.id),
      );
      return json({ ok: true });
    }
    if (action === "update_card") {
      const patch = z
        .object({
          front: z.string().min(1).max(1500),
          back: z.string().min(1).max(4000),
        })
        .strict()
        .parse(input.patch);
      check(
        await ctx.db
          .from("session_cards")
          .update(patch)
          .eq("id", z.uuid().parse(input.card_id))
          .eq("room_id", id)
          .eq("user_id", ctx.user.id),
      );
      return json({ ok: true });
    }
    if (action === "delete_card") {
      check(
        await ctx.db
          .from("session_cards")
          .delete()
          .eq("id", z.uuid().parse(input.card_id))
          .eq("room_id", id)
          .eq("user_id", ctx.user.id),
      );
      return json({ ok: true });
    }
    if (action === "delete") {
      host(ctx, room);
      if (room.status === "live")
        throw new HttpError(
          409,
          "End the live meeting before deleting its records.",
        );
      check(await ctx.db.from("session_rooms").delete().eq("id", id));
      return json({ ok: true });
    }
    if (action === "process") {
      if (!capabilities().ai)
        throw new HttpError(
          503,
          "AI is not configured. Your transcript remains accessible.",
        );
      const kind = z
        .enum([
          "notes",
          "ask",
          "study",
          "explain",
          "teach",
          "followup",
          "translate",
        ])
        .parse(input.kind);
      if (kind === "notes") host(ctx, room);
      const question = z
        .string()
        .max(2500)
        .parse(input.question || "");
      const requestId = z.uuid().parse(input.request_id);
      const key = createHash("sha256")
        .update(`${kind}:${question}:${requestId}`)
        .digest("hex");
      const jobId = check(
        await ctx.db.rpc("session_reserve_job", {
          room: id,
          kind,
          request_key: key,
        }),
      ).data as string;
      const claimed = check(
        await ctx.db.rpc("session_claim_job", { job: jobId }),
      ).data;
      if (claimed)
        defer(async () => {
          try {
            const segments = check(
              await ctx.db
                .from("session_segments")
                .select("*")
                .eq("room_id", id)
                .gte(
                  "created_at",
                  new Date(
                    Date.now() - room.retention_days * 86400000,
                  ).toISOString(),
                )
                .order("start_ms")
                .limit(3000),
            ).data as Segment[];
            if (!segments.length)
              throw Error("No authorized transcript is available.");
            let output: unknown;
            if (kind === "notes") {
              const result = await generateNotes(segments, room.kind);
              check(
                await ctx.db.from("session_notes").upsert({
                  room_id: id,
                  body: result.body,
                  published: false,
                  ai_generated: true,
                  updated_at: new Date().toISOString(),
                }),
              );
              output = result;
            } else
              output = await runIntelligence(
                kind,
                segments,
                kind === "translate"
                  ? `Translate source passages into ${question}; preserve original meaning and references.`
                  : question,
              );
            check(
              await ctx.db
                .from("session_jobs")
                .update({ state: "done", output, error: null })
                .eq("id", jobId),
            );
          } catch (e) {
            await ctx.db
              .from("session_jobs")
              .update({
                state: "failed",
                error:
                  e instanceof Error
                    ? e.message.slice(0, 500)
                    : "Processing failed; the original transcript is unchanged.",
              })
              .eq("id", jobId);
          }
        });
      return json({ job_id: jobId, claimed }, 202);
    }
    throw new HttpError(400, "Unknown Sessions action.");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError)
      return json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    return json(
      { error: e instanceof Error ? e.message : "Sessions request failed." },
      500,
    );
  }
}
async function speechRequest(request: Request, ctx: SessionContext) {
  const form = await request.formData();
  const id = z.uuid().parse(form.get("roomId"));
  const room = await roomFor(ctx, id);
  if (!capabilities().stt)
    throw new HttpError(503, "Speech recognition is not configured.");
  const blob = form.get("audio");
  if (
    !(blob instanceof Blob) ||
    blob.size > 2000000 ||
    ![
      "audio/webm",
      "audio/webm;codecs=opus",
      "audio/mp4",
      "audio/ogg",
      "audio/ogg;codecs=opus",
    ].includes(blob.type)
  )
    throw new HttpError(400, "Choose a supported audio chunk under 2 MB.");
  const start = z.coerce.number().int().min(0).parse(form.get("start_ms"));
  const end = z.coerce
    .number()
    .int()
    .min(start + 1)
    .max(start + 60000)
    .parse(form.get("end_ms"));
  const language = z.enum(languages).parse(form.get("language"));
  const key = z.uuid().parse(form.get("request_id"));
  const jobId = check(
    await ctx.db.rpc("session_reserve_stt", {
      room: room.id,
      request_key: key,
    }),
  ).data;
  const claimed = check(
    await ctx.db.rpc("session_claim_job", { job: jobId }),
  ).data;
  if (!claimed) return json({ job_id: jobId, replayed: true });
  try {
    const transcription = await transcribeAudio(blob, language);
    const member = check(
      await ctx.db
        .from("session_members")
        .select("display_name")
        .eq("room_id", id)
        .eq("user_id", ctx.user.id)
        .single(),
    ).data;
    if (transcription.text.trim())
      check(
        await ctx.db.from("session_segments").insert({
          room_id: id,
          speaker_id: ctx.user.id,
          speaker_name: member?.display_name || "Authenticated participant",
          start_ms: start,
          end_ms: end,
          language: transcription.language,
          original_text: transcription.text,
          source_kind: "stt",
        }),
      );
    check(
      await ctx.db
        .from("session_jobs")
        .update({
          state: "done",
          output: { characters: transcription.text.length },
        })
        .eq("id", jobId),
    );
    return json({ ok: true });
  } catch (e) {
    await ctx.db
      .from("session_jobs")
      .update({
        state: "failed",
        error: "Speech recognition failed; existing transcript preserved.",
      })
      .eq("id", jobId);
    throw e;
  }
}
export function requestId() {
  return randomUUID();
}
