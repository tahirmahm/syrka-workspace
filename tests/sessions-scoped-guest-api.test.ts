import { test, expect, vi, afterEach } from "vitest";
import { RoomServiceClient, TokenVerifier } from "livekit-server-sdk";
const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: mock.rpc }),
}));
import {
  guestHandler,
  guestCookieName,
  revokeGuestMedia,
} from "../src/lib/sessions/scoped-guests";
const room = "10000000-0000-4000-8000-000000000010",
  guest = "10000000-0000-4000-8000-000000000002";
const member = {
  user_id: guest,
  status: "waiting",
  display_name: "Visitor",
  can_publish: true,
  guest_identity: true,
  expires_at: new Date(Date.now() + 14400000).toISOString(),
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  mock.rpc.mockReset();
});
function config() {
  for (const [k, v] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: "https://zguejzlseldovdssiumn.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    LIVEKIT_ENABLED: "true",
    LIVEKIT_URL: "wss://unit-test.livekit.cloud",
    LIVEKIT_API_KEY: "test-key",
    LIVEKIT_API_SECRET: "test-signing-secret",
    VERCEL_ENV: "preview",
  }))
    vi.stubEnv(k, v);
}
function post(
  action: string,
  cookie?: string,
  extra: Record<string, unknown> = {},
) {
  return new Request("https://unit.test/workspace/api/sessions/guest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://unit.test",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({ roomId: room, action, ...extra }),
  });
}
test("guest request issues only an HttpOnly room credential and never calls Auth", async () => {
  config();
  mock.rpc.mockResolvedValue({ data: member, error: null });
  const r = await guestHandler(
    post("request_join", undefined, { display_name: "Visitor" }),
  );
  expect(r.status).toBe(200);
  const cookie = r.headers.get("set-cookie")!;
  expect(cookie).toContain(guestCookieName(room));
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=Lax");
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("Path=/workspace/api/sessions/guest");
  expect(await r.json()).toEqual({
    ok: true,
    admission: "waiting",
    user_id: guest,
  });
  expect(mock.rpc.mock.calls[0][0]).toBe("session_guest_request");
  expect(mock.rpc.mock.calls[0][1].ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
});
test("waiting, cross-site and unauthorized guest actions never mint a token", async () => {
  config();
  mock.rpc.mockResolvedValue({ data: { admission: "waiting" }, error: null });
  const cookie = `${guestCookieName(room)}=${"x".repeat(43)}`;
  expect((await guestHandler(post("token"))).status).toBe(401);
  expect((await guestHandler(post("token", cookie))).status).toBe(403);
  expect((await guestHandler(post("host_update", cookie))).status).toBe(403);
  const cross = post("request_join", undefined, { display_name: "Visitor" });
  cross.headers.set("Origin", "https://foreign.test");
  expect((await guestHandler(cross)).status).toBe(403);
});
test("approved guest receives a 60-second scoped grant and removal invokes explicit Cloud token revocation", async () => {
  config();
  mock.rpc.mockResolvedValue({
    data: { ...member, status: "approved" },
    error: null,
  });
  vi.spyOn(RoomServiceClient.prototype, "listRooms").mockResolvedValue([
    {},
  ] as never);
  const r = await guestHandler(
    post("token", `${guestCookieName(room)}=${"x".repeat(43)}`),
  );
  expect(r.status).toBe(200);
  const b = await r.json();
  const claims = await new TokenVerifier(
    "test-key",
    "test-signing-secret",
  ).verify(b.token);
  expect(claims.sub).toBe(`workspace:guest:${guest}`);
  expect(claims.video?.room).toBe(`syrka-workspace-${room}`);
  expect(claims.video?.canPublishSources).toEqual([
    "camera",
    "microphone",
    "screen_share",
    "screen_share_audio",
  ]);
  expect((claims.exp || 0) - (claims.nbf || 0)).toBeLessThanOrEqual(60);
  const remove = vi
    .spyOn(RoomServiceClient.prototype, "removeParticipant")
    .mockResolvedValue(undefined);
  await revokeGuestMedia(room, member);
  expect(remove.mock.calls[0].slice(0, 2)).toEqual([
    `syrka-workspace-${room}`,
    `workspace:guest:${guest}`,
  ]);
  expect(remove.mock.calls[0][2]!.revokeTokenTs).toBeLessThanOrEqual(
    BigInt(Math.floor(Date.now() / 1000) + 60),
  );
  expect(remove.mock.calls[0][2]!.revokeTokenTs).toBeGreaterThan(
    BigInt(Math.floor(Date.now() / 1000) + 25),
  );
});
