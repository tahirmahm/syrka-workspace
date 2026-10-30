"use client";
import { supabase, isDemoMode, setDemoMode } from "../storage";
import { demoStore, saveDemo } from "./demo";
import {
  nextReview,
  type SessionSource,
  type SessionRoom,
  type Snapshot,
  type GeneratedNotes,
} from "./model";
import { parseTranscript } from "./transcripts";
export function endpoint(source: SessionSource) {
  return source === "campus" ? "/cam/api/sessions" : "/workspace/api/sessions";
}
export async function sessionHeaders(
  source: SessionSource,
): Promise<Record<string, string>> {
  if (source === "campus") return {};
  const { data } = supabase
    ? await supabase.auth.getSession()
    : { data: { session: null } };
  return data.session
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : {};
}
export async function sessionsApi(
  source: SessionSource,
  payload?: Record<string, unknown>,
  id?: string,
  after?: string,
) {
  const roomId = id || (typeof payload?.roomId === "string" ? payload.roomId : undefined);
  if (source === "workspace" && isDemoMode() && (!roomId || demoStore().snapshots[roomId]))
    return demoRequest(payload, id);
  const headers = await sessionHeaders(source);
  if (source === "workspace" && roomId && headers.Authorization && isDemoMode()) setDemoMode(false);
  const query = new URLSearchParams();
  if (id) query.set("id", id);
  if (after) query.set("after", after);
  const response = await fetch(
    endpoint(source) + (query.size ? "?" + query : ""),
    {
      method: payload ? "POST" : "GET",
      headers: {
        ...headers,
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
      cache: "no-store",
      credentials: "same-origin",
    },
  );
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw Error("Sign in to the selected application before opening Sessions.");
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(result.error || "Sessions request failed."), {
      status: response.status,
    });
  return result;
}
function demoRequest(payload?: Record<string, unknown>, id?: string): unknown {
  const data = demoStore();
  if (!payload)
    return id
      ? data.snapshots[id] || Promise.reject(Error("Demo session not found."))
      : {
          rooms: data.rooms,
          capabilities: data.snapshots[data.rooms[0].id].capabilities,
          user_id: data.rooms[0].owner_id,
        };
  const roomId = String(payload.roomId || "");
  const snap = data.snapshots[roomId];
  switch (payload.action) {
    case "create": {
      const info = payload.data as SessionRoom;
      const room = {
        ...data.rooms[0],
        ...info,
        id: crypto.randomUUID(),
        status: "scheduled" as const,
        description: info.description || "Local demo session",
      };
      data.rooms.unshift(room);
      data.snapshots[room.id] = {
        ...data.snapshots[Object.keys(data.snapshots)[0]],
        room,
        segments: [],
        note: null,
        jobs: [],
        cards: [],
        me: {
          room_id: room.id,
          user_id: room.owner_id,
          display_name: "You (demo)",
          status: "approved",
          consent: false,
          can_publish: true,
        },
      };
      saveDemo(data);
      return { rooms: [room] };
    }
    case "import": {
      if (!payload.confirmed) throw Error("Import permission is required.");
      const entries = parseTranscript(
        String(payload.text),
        String(payload.format),
      );
      snap.segments.push(
        ...entries.map((s) => ({
          ...s,
          id: crypto.randomUUID(),
          room_id: roomId,
          created_at: new Date().toISOString(),
          edited_text: null,
          important: false,
        })),
      );
      break;
    }
    case "host_update":
      Object.assign(snap.room, payload.patch);
      break;
    case "save_note":
      snap.note = {
        room_id: roomId,
        body: payload.body as GeneratedNotes,
        published: !!payload.published,
        ai_generated: false,
        updated_at: new Date().toISOString(),
      };
      break;
    case "edit_segment": {
      const segment = snap.segments.find((s) => s.id === payload.segment_id);
      if (segment) Object.assign(segment, payload.patch);
      break;
    }
    case "review_card": {
      const card = snap.cards.find((c) => c.id === payload.card_id);
      if (card)
        Object.assign(card, {
          confidence: payload.confidence,
          ...nextReview(Number(payload.confidence), card.interval_days),
        });
      break;
    }
    case "card":
      snap.cards.push({
        ...(payload.data as Snapshot["cards"][number]),
        id: crypto.randomUUID(),
        room_id: roomId,
        confidence: 0,
        interval_days: 1,
        due_at: new Date().toISOString(),
      });
      break;
    case "update_card": {
      const card = snap.cards.find((c) => c.id === payload.card_id);
      if (card) Object.assign(card, payload.patch);
      break;
    }
    case "delete_card":
      snap.cards = snap.cards.filter((c) => c.id !== payload.card_id);
      break;
    case "delete":
      data.rooms = data.rooms.filter((r) => r.id !== roomId);
      delete data.snapshots[roomId];
      break;
    case "annotate":
      Object.assign(snap, { annotations: payload.data });
      break;
    default:
      throw Error("Live media and AI are not available in the local demo.");
  }
  saveDemo(data);
  return { ok: true };
}

export async function searchSessions(source: SessionSource, query: string) {
  if (source === "workspace" && isDemoMode()) {
    const data = demoStore();
    return Object.values(data.snapshots).flatMap((s) => [
      ...s.segments
        .filter((t) =>
          (t.edited_text ?? t.original_text)
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .map((t) => ({
          room_id: s.room.id,
          title: s.room.title,
          kind: "transcript",
          snippet: t.edited_text ?? t.original_text,
          segment_id: t.id,
          start_ms: t.start_ms,
        })),
      ...(JSON.stringify(s.note?.body || {})
        .toLowerCase()
        .includes(query.toLowerCase())
        ? [
            {
              room_id: s.room.id,
              title: s.room.title,
              kind: "notes",
              snippet: s.note?.body.overview[0]?.text || "Notes",
              segment_id: null,
              start_ms: null,
            },
          ]
        : []),
    ]);
  }
  const response = await fetch(
    endpoint(source) + "?" + new URLSearchParams({ q: query }),
    {
      headers: await sessionHeaders(source),
      credentials: "same-origin",
      cache: "no-store",
    },
  );
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw Error("Sign in to search your authorized records.");
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Search failed.");
  return result.results;
}
