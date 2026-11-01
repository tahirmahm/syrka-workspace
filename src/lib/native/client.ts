import { supabase, isDemoMode } from "@/lib/storage";
export async function nativeRequest(path: string, body?: unknown) {
  const { data } = supabase
    ? await supabase.auth.getSession()
    : { data: { session: null } };
  const response = await fetch("/workspace/api/native/" + path, {
    method: body ? "POST" : "GET",
    signal: AbortSignal.timeout(path === "ai" ? 65000 : 35000),
    headers: {
      "Content-Type": "application/json",
      ...(data.session
        ? { Authorization: "Bearer " + data.session.access_token }
        : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  if (!response.ok) throw Error(value.error || "The request failed.");
  return value;
}
export async function rows<T>(table: string): Promise<T[]> {
  if (isDemoMode())
    return JSON.parse(localStorage.getItem("syrka-native-" + table) || "[]");
  if (!supabase) throw Error("Cloud configuration is unavailable.");
  const all: T[] = [];
  for (let offset = 0; offset < 50000; offset += 500) {
    const query =
      table === "native_exceptions"
        ? supabase.rpc("native_calendar_exceptions").select("*")
        : supabase.from(table).select("*");
    const ordered = query.order(
      table === "native_exceptions"
        ? "event_id"
        : table === "native_calendar_shares"
          ? "calendar_id"
          : "id",
    );
    const { data, error } = await (
      table === "native_exceptions" ? ordered.order("original_start") : ordered
    ).range(offset, offset + 499);
    if (error) throw Error(error.message);
    all.push(...(data as T[]));
    if (data.length < 500) return all;
  }
  throw Error(
    "This dataset exceeds the interactive limit of 50,000 records. Narrow or archive records before continuing.",
  );
}
export async function put(
  table: string,
  record: Record<string, unknown>,
  revision?: number,
) {
  if (table === "native_calendars")
    record = Object.fromEntries(
      Object.entries(record).filter(
        ([key]) => !["role", "archived"].includes(key),
      ),
    );
  if (isDemoMode()) {
    const all = await rows<Record<string, unknown>>(table);
    const index = all.findIndex((r) =>
      record.id
        ? r.id === record.id
        : r.event_id === record.event_id &&
          r.original_start === record.original_start,
    );
    if (index >= 0) all[index] = { ...all[index], ...record };
    else all.push(record);
    localStorage.setItem("syrka-native-" + table, JSON.stringify(all));
    return record;
  }
  if (!supabase) throw Error("Cloud configuration is unavailable.");
  const query =
    table === "native_notifications"
      ? supabase.from(table).update({ read: record.read }).eq("id", record.id)
      : record.id && !record.owner_id
        ? supabase.from(table).update(record).eq("id", record.id)
        : revision === undefined
          ? supabase.from(table).upsert(record, {
              onConflict:
                table === "native_exceptions"
                  ? "event_id,original_start"
                  : "id",
            })
          : supabase
              .from(table)
              .update(record)
              .eq("id", record.id)
              .eq("revision", revision);
  const { data, error } = await query.select().single();
  if (error)
    throw Error(
      revision !== undefined
        ? "Save conflict or connection error. Your changes remain open; reload before overwriting another version. " +
            error.message
        : error.message,
    );
  return data;
}
export async function remove(table: string, id: string) {
  if (isDemoMode()) {
    localStorage.setItem(
      "syrka-native-" + table,
      JSON.stringify(
        (await rows<{ id: string }>(table)).filter((r) => r.id !== id),
      ),
    );
    return;
  }
  const { error } = await supabase!.from(table).delete().eq("id", id);
  if (error) throw Error(error.message);
}
export function saveDownload(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]/g, "_");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
