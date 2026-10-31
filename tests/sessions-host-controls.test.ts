import { test, expect, vi, afterEach } from "vitest";
import { RoomServiceClient, TrackType } from "livekit-server-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sessionsHandler } from "../src/lib/sessions/server";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
test("only the host can mute an admitted participant; the server never remotely unmutes", async () => {
  const host = "10000000-0000-4000-8000-000000000001",
    guest = "10000000-0000-4000-8000-000000000002",
    room = "10000000-0000-4000-8000-000000000010";
  for (const [key, value] of Object.entries({
    LIVEKIT_ENABLED: "true",
    LIVEKIT_URL: "wss://unit-test.livekit.cloud",
    LIVEKIT_API_KEY: "unit-test-key",
    LIVEKIT_API_SECRET: "unit-test-signing-secret",
  }))
    vi.stubEnv(key, value);
  const get = vi
    .spyOn(RoomServiceClient.prototype, "getParticipant")
    .mockResolvedValue({
      tracks: [
        { sid: "TR_microphone", type: TrackType.AUDIO, muted: false },
        { sid: "TR_camera", type: TrackType.VIDEO, muted: false },
      ],
    } as never);
  const mute = vi
    .spyOn(RoomServiceClient.prototype, "mutePublishedTrack")
    .mockResolvedValue({} as never);
  const db = {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data:
            table === "session_rooms"
              ? { id: room, owner_id: host, status: "live" }
              : { status: "approved" },
          error: null,
        }),
      };
      return query;
    },
  } as unknown as SupabaseClient;
  const invoke = (id: string) =>
    sessionsHandler(
      new Request("https://unit.test/workspace/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mute_member",
          roomId: room,
          user_id: guest,
        }),
      }),
      { db, user: { id }, source: "workspace" },
      () => {},
    );
  expect((await invoke(guest)).status).toBe(403);
  expect(get).not.toHaveBeenCalled();
  const response = await invoke(host);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ muted: 1 });
  expect(mute).toHaveBeenCalledExactlyOnceWith(
    `syrka-workspace-${room}`,
    `workspace:${guest}`,
    "TR_microphone",
    true,
  );
});
