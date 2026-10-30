import { afterEach, expect, test, vi } from "vitest";
import { TokenVerifier } from "livekit-server-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sessionsHandler } from "../src/lib/sessions/server";
const actor = "10000000-0000-4000-8000-000000000001";
const roomId = "10000000-0000-4000-8000-000000000010";
afterEach(() => vi.unstubAllEnvs());
async function mint(
  status = "approved",
  publish = true,
  ended = false,
  serverUrl = "wss://unit-test.livekit.cloud",
) {
  vi.stubEnv("LIVEKIT_ENABLED", "true");
  vi.stubEnv("LIVEKIT_URL", serverUrl);
  vi.stubEnv("LIVEKIT_API_KEY", "unit-test-key");
  vi.stubEnv("LIVEKIT_API_SECRET", "unit-test-secret-long-enough-for-signing");
  vi.stubEnv("SYRKA_FREE_TIER_CONFIRMED", "false");
  const db = {
    from(table: string) {
      const result = {
        data:
          table === "session_rooms"
            ? {
                id: roomId,
                owner_id: actor,
                status: ended ? "ended" : "live",
                transcribing: false,
              }
            : {
                status,
                can_publish: publish,
                consent: false,
                display_name: "Authenticated participant",
              },
        error: null,
      };
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        maybeSingle: async () => result,
        single: async () => result,
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return sessionsHandler(
    new Request("https://unit.test/workspace/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "token", roomId }),
    }),
    { db, user: { id: actor }, source: "workspace" },
    () => {},
  );
}
test("approved non-consenting participants can obtain scoped short-lived media tokens independently of AI", async () => {
  const response = await mint();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(Object.keys(body).sort()).toEqual(["token", "url"]);
  const claims = await new TokenVerifier(
    "unit-test-key",
    "unit-test-secret-long-enough-for-signing",
  ).verify(body.token);
  expect(claims.sub).toBe(`workspace:${actor}`);
  expect(claims.name).toBe("Authenticated participant");
  expect(claims.video?.room).toBe(`syrka-workspace-${roomId}`);
  expect(claims.video?.canPublish).toBe(true);
  expect(claims.video?.canSubscribe).toBe(true);
  expect((claims.exp || 0) - (claims.nbf || 0)).toBeLessThanOrEqual(300);
  expect(JSON.stringify(body)).not.toContain(
    "unit-test-secret-long-enough-for-signing",
  );
});
test("host-disabled publishers retain subscription but cannot publish", async () => {
  const response = await mint("approved", false);
  const body = await response.json();
  const claims = await new TokenVerifier(
    "unit-test-key",
    "unit-test-secret-long-enough-for-signing",
  ).verify(body.token);
  expect(claims.video?.canPublish).toBe(false);
  expect(claims.video?.canSubscribe).toBe(true);
});
test("waiting, removed and ended sessions cannot mint media tokens", async () => {
  expect((await mint("waiting")).status).toBe(403);
  expect((await mint("removed")).status).toBe(403);
  expect((await mint("approved", true, true)).status).toBe(409);
});
test.each([[false, "waiting"], [true, "waiting"], [false, "removed"], [true, "removed"]])("pending/removed guests receive only admission status (visible %s, status %s)", async (visible, status) => {
  const db = {
    from(table: string) {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        maybeSingle: async () => ({
          data: table === "session_members" ? { status } : visible ? { id: roomId, owner_id: "another-host" } : null,
          error: null,
        }),
      };
      return query;
    },
  } as unknown as SupabaseClient;
  const response = await sessionsHandler(
    new Request(`https://unit.test/workspace/api/sessions?id=${roomId}`),
    { db, user: { id: actor }, source: "workspace" },
    () => {},
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    admission: status,
    user_id: actor,
  });
});

test("media URLs cannot leak embedded credentials into the client response", async () => {
  const response = await mint(
    "approved",
    true,
    false,
    "wss://unit-user:unit-password@unit-test.livekit.cloud",
  );
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("unit-password");
});
