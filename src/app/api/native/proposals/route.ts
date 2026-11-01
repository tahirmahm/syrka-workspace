import { account, failure, sameOrigin } from "@/lib/native/server";
import { calendarActionSchema } from "@/lib/native/contracts";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const auth = (await account(req))!;
    const proposal = calendarActionSchema.parse(await req.json());
    const { data: previous, error: lookup } = await auth.db
      .from("native_proposals")
      .select("*")
      .eq("source", proposal.source)
      .eq("idempotency_key", proposal.idempotency_key)
      .maybeSingle();
    if (lookup) throw lookup;
    if (previous)
      return Response.json({
        id: previous.id,
        status: previous.status,
        duplicate: true,
      });
    const { data, error } = await auth.db
      .from("native_proposals")
      .insert({
        owner_id: auth.user.id,
        source: proposal.source,
        idempotency_key: proposal.idempotency_key,
        payload: proposal,
      })
      .select("id,status")
      .single();
    if (error) throw error;
    return Response.json({ ...data, review_required: true }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
