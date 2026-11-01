import { createHmac, timingSafeEqual } from "node:crypto";
import { broker, failure, database } from "@/lib/native/server";
import {
  expandEvent,
  validateEvent,
  type CalendarException,
} from "@/lib/native/calendar";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    const ts = req.headers.get("x-syrka-time") || "",
      provided = req.headers.get("x-syrka-signature") || "",
      key = process.env.SYRKA_NATIVE_SIGNING_KEY;
    if (
      !key ||
      !/^\d+$/.test(ts) ||
      Math.abs(Date.now() / 1000 - Number(ts)) > 90 ||
      !/^[0-9a-f]{64}$/.test(provided)
    )
      return new Response("Unauthorized", { status: 401 });
    const expected = createHmac("sha256", key)
      .update("reminder-worker:" + ts)
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(provided, "hex")))
      return new Response("Unauthorized", { status: 401 });
    const snapshot = await broker({ op: "reminder_snapshot" });
    const from = new Date().toISOString(),
      to = new Date(Date.now() + 90 * 86400000).toISOString();
    let processed = 0,
      failed = 0;
    for (const row of snapshot.events) {
      try {
        const e = validateEvent(row.data);
        const jobs = expandEvent(
          e,
          snapshot.exceptions as CalendarException[],
          from,
          to,
        )
          .flatMap((o) =>
            e.reminders.map((minutes) => ({
              occurrence: o.original_start,
              due_at: new Date(
                Date.parse(o.start) - minutes * 60000,
              ).toISOString(),
              title: o.event.title,
            })),
          )
          .filter((j) => j.due_at >= from);
        await broker({
          op: "reminder_seed",
          revision: row.revision,
          user_id: row.owner_id,
          event_id: row.id,
          jobs,
        });
        processed++;
      } catch {
        failed++;
      }
    }
    const garbage = await broker({ op: "garbage" }, "native_attachment_broker");
    let cleaned = 0;
    if (Array.isArray(garbage) && garbage.length) {
      const result = await database()
        .storage.from("office-form-uploads")
        .remove(garbage);
      if (!result.error) {
        await broker(
          { op: "cleaned", paths: garbage },
          "native_attachment_broker",
        );
        cleaned = garbage.length;
      } else failed++;
    }
    return Response.json(
      { processed, failed, cleaned, through: to },
      { status: failed ? 207 : 200 },
    );
  } catch (e) {
    return failure(e);
  }
}
