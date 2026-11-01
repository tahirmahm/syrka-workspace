import { z } from "zod";
import { account, broker, failure, sameOrigin } from "@/lib/native/server";
import {
  expandEvent,
  validateEvent,
  type CalendarException,
} from "@/lib/native/calendar";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const auth = (await account(req))!;
    const { id } = z.object({ id: z.uuid() }).parse(await req.json());
    const { data, error } = await auth.db
      .from("native_events")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) throw Error("Event unavailable.");
    if (data.owner_id !== auth.user.id)
      return Response.json({
        message:
          "Shared event saved. The owner manages its scheduled reminders.",
      });
    const e = validateEvent(data.data);
    const { data: ex, error: ee } = await auth.db
      .from("native_exceptions")
      .select("*")
      .eq("event_id", id);
    if (ee) throw ee;
    const from = new Date().toISOString(),
      to = new Date(Date.now() + 90 * 86400000).toISOString();
    const jobs = expandEvent(e, (ex || []) as CalendarException[], from, to)
      .flatMap((o) =>
        e.reminders.map((minutes) => ({
          occurrence: o.original_start,
          due_at: new Date(Date.parse(o.start) - minutes * 60000).toISOString(),
          title: o.event.title,
        })),
      )
      .filter((j) => j.due_at >= from);
    await broker({
      op: "reminder_seed",
      revision: data.revision,
      user_id: auth.user.id,
      event_id: id,
      jobs,
    });
    return Response.json({
      scheduled: jobs.length,
      through: to,
      message: jobs.length
        ? `${jobs.length} in-app reminders scheduled for the next 90 days.`
        : "Event saved. No reminders fall within the next 90 days.",
    });
  } catch (e) {
    return failure(e);
  }
}
