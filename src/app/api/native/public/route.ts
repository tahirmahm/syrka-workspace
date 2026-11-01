import { z } from "zod";
import {
  account,
  broker,
  failure,
  fingerprint,
  hash,
  rate,
  sameOrigin,
} from "@/lib/native/server";
import {
  publicSchema,
  validateForm,
  validateAnswers,
  score,
} from "@/lib/native/forms";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const token = z.uuid().parse(new URL(req.url).searchParams.get("token"));
    const auth = await account(req, false);
    const data = await broker({
      op: "load",
      token,
      user_id: auth?.user.id || null,
    });
    return Response.json(
      { ...data, schema: publicSchema(validateForm(data.schema)) },
      {
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    if (Number(req.headers.get("content-length")) > 150000)
      throw Error("Response is too large.");
    const body = z
      .object({
        token: z.uuid(),
        version_id: z.uuid(),
        response_id: z.uuid(),
        receipt: z.string().min(32).max(100),
        answers: z.unknown(),
        website: z.string().max(0).default(""),
      })
      .parse(await req.json());
    await rate(req, "form-submit");
    const auth = await account(req, false);
    const data = await broker({
      op: "load",
      token: body.token,
      user_id: auth?.user.id || null,
    });
    if (data.version_id !== body.version_id)
      throw Error("The form changed. Reload before submitting.");
    const schema = validateForm(data.schema),
      answers = validateAnswers(schema, body.answers);
    for (const q of schema.questions.filter(
      (q) => q.type === "file" && answers[q.id],
    ))
      await broker(
        {
          op: "check",
          id: answers[q.id],
          form_id: data.id,
          version_id: data.version_id,
          response_id: body.response_id,
          question_id: q.id,
          receipt_hash: hash(body.receipt),
        },
        "native_attachment_broker",
      );
    const result = await broker({
      op: "submit",
      ...body,
      answers,
      score: schema.quiz ? score(schema, answers) : null,
      user_id: auth?.user.id || null,
      receipt_hash: hash(body.receipt),
      client_hash: fingerprint(req),
    });
    return Response.json(
      { ...result, confirmation: schema.confirmation },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
