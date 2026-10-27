import { createClient } from "@supabase/supabase-js";
import type { OfficeFile } from "./model";
import { validateCloudConfig } from "./cloud-config";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const cloudConfigError = validateCloudConfig(url, key);
async function timedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const signal = init?.signal;
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 20000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
export const supabase =
  !cloudConfigError && url && key
    ? createClient(url, key, { global: { fetch: timedFetch } })
    : null;
function cloud() {
  if (!supabase)
    throw Error(cloudConfigError || "Cloud storage is unavailable.");
  return supabase;
}
const LOCAL_KEY = "syrka-office-v1";
const DEMO_KEY = "syrka-workspace-demo";
export function isDemoMode() {
  try {
    return (
      typeof window !== "undefined" &&
      sessionStorage.getItem(DEMO_KEY) === "true"
    );
  } catch {
    return false;
  }
}
export function setDemoMode(enabled: boolean) {
  if (enabled) sessionStorage.setItem(DEMO_KEY, "true");
  else sessionStorage.removeItem(DEMO_KEY);
}
export async function listFiles(): Promise<OfficeFile[]> {
  if (isDemoMode()) return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  const { data, error } = await cloud()
    .from("office_files")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}
export async function saveFile(file: OfficeFile) {
  if (isDemoMode()) {
    const all = await listFiles();
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify([file, ...all.filter((f) => f.id !== file.id)]),
    );
    return;
  }
  const { error } = await cloud().from("office_files").upsert(file);
  if (error) throw error;
}
export async function deleteFile(id: string) {
  if (isDemoMode()) {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify((await listFiles()).filter((f) => f.id !== id)),
    );
    return;
  }
  const { error } = await cloud().from("office_files").delete().eq("id", id);
  if (error) throw error;
}
export async function uploadImage(file: File): Promise<string> {
  if (
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)
  )
    throw Error("Choose a PNG, JPEG, WebP or GIF image.");
  if (file.size > 5 * 1024 * 1024)
    throw Error("Images must be smaller than 5 MB.");
  if (isDemoMode())
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  const {
    data: { user },
  } = await cloud().auth.getUser();
  if (!user) throw Error("Sign in to upload images.");
  const path = `${user.id}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
  const { error } = await cloud()
    .storage.from("office-assets")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}
export async function resolveImage(path: string) {
  if (path.startsWith("data:")) return path;
  if (!supabase) throw Error("Storage is not configured");
  const { data, error } = await cloud()
    .storage.from("office-assets")
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
