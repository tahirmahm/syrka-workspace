import { describe, it, expect } from "vitest";
import {
  validateCloudConfig,
  WORKSPACE_SUPABASE_URL,
  authErrorMessage,
} from "../src/lib/cloud-config";
describe("cloud authentication configuration", () => {
  it("accepts only the dedicated project and a publishable browser key", () => {
    expect(
      validateCloudConfig(WORKSPACE_SUPABASE_URL, "sb_publishable_test-key"),
    ).toBeNull();
    expect(validateCloudConfig()).not.toBeNull();
    expect(
      validateCloudConfig(
        "https://ejzymrrfyezvdiocwsew.supabase.co",
        "sb_publishable_test-key",
      ),
    ).toContain("wrong authentication project");
    expect(
      validateCloudConfig(WORKSPACE_SUPABASE_URL, "sb_secret_never-public"),
    ).not.toBeNull();
  });
  it("shows actionable provider and network failures", () => {
    expect(
      authErrorMessage({ code: "email_address_not_authorized" }),
    ).toContain("authorized project addresses");
    expect(authErrorMessage({ code: "over_email_send_rate_limit" })).toContain(
      "limit",
    );
    expect(authErrorMessage({ message: "Failed to fetch" })).toContain(
      "connection",
    );
  });
});
