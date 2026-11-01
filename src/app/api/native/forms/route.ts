import { z } from "zod";
import { account, broker, failure, sameOrigin } from "@/lib/native/server";
import { validateForm } from "@/lib/native/forms";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const auth = (await account(req))!;
    const body = z
      .object({ form_id: z.uuid(), revision: z.number().int().min(0) })
      .parse(await req.json());
    const { data, error } = await auth.db
      .from("native_forms")
      .select("*")
      .eq("id", body.form_id)
      .single();
    if (error || !data) throw Error("Form unavailable.");
    const schema = validateForm(data.draft);
    const version = await broker({
      op: "publish",
      ...body,
      user_id: auth.user.id,
      schema,
    });
    return Response.json({ version });
  } catch (e) {
    return failure(e);
  }
}
