import { test, expect, vi, afterEach } from "vitest";
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "guest", is_anonymous: true } },
        error: null,
      }),
    },
  }),
}));
import { GET, POST } from "../src/app/api/sessions/route";
afterEach(() => vi.unstubAllEnvs());
test("anonymous Auth cannot list Workspace sessions or invoke host, file and AI actions", async () => {
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    "https://zguejzlseldovdssiumn.supabase.co",
  );
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_unit_test",
  );
  const headers = {
    Authorization: "Bearer unit-test-token",
    "Content-Type": "application/json",
  };
  expect(
    (
      await GET(
        new Request("https://unit.test/workspace/api/sessions", { headers }),
      )
    ).status,
  ).toBe(403);
  for (const action of [
    "create",
    "host_update",
    "member_update",
    "mute_member",
    "import",
    "process",
    "save_note",
    "prepare_audio",
    "delete",
  ]) {
    const r = await POST(
      new Request("https://unit.test/workspace/api/sessions", {
        method: "POST",
        headers,
        body: JSON.stringify({ action }),
      }),
    );
    expect(r.status).toBe(403);
  }
});
