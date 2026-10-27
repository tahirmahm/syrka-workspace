export const WORKSPACE_SUPABASE_URL =
  "https://zguejzlseldovdssiumn.supabase.co";
export function validateCloudConfig(url?: string, key?: string) {
  if (!url || !key)
    return "Cloud sign-in is unavailable because this site’s authentication configuration is incomplete. You can still try the demo or use Tools.";
  if (url.replace(/\/$/, "") !== WORKSPACE_SUPABASE_URL)
    return "Cloud sign-in is unavailable because this site is connected to the wrong authentication project. You can still try the demo or use Tools.";
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))
    return "Cloud sign-in is unavailable because the browser authentication key is invalid. You can still try the demo or use Tools.";
  return null;
}
export function authErrorMessage(error: unknown) {
  const e = error as { message?: string; code?: string };
  if (
    e.code === "email_address_not_authorized" ||
    /email address not authorized/i.test(e.message || "")
  )
    return "The email provider only allows verification messages to authorized project addresses. No verification email could be sent. Please contact the workspace owner, or use the demo.";
  if (
    e.code === "over_email_send_rate_limit" ||
    /email.*rate.*limit/i.test(e.message || "")
  )
    return "The verification email limit has been reached. Please wait before trying again, or use the demo. Email delivery has not been confirmed.";
  if (/fetch|network|timed out|abort/i.test(e.message || ""))
    return "Could not reach the sign-in service. Check your connection and try again.";
  return e.message || "Sign-in could not be completed. Please try again.";
}
