import { z } from "zod";
import { randomBytes } from "node:crypto";
import {
  account,
  broker,
  database,
  failure,
  hash,
  rate,
  sameOrigin,
} from "@/lib/native/server";
import {
  validateForm,
  visibleQuestions,
  type Answers,
} from "@/lib/native/forms";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rate(req, "form-upload");
    if (Number(req.headers.get("content-length")) > 2200000)
      throw Error("Files must be smaller than 2 MB.");
    const form = await req.formData();
    const fields = z
      .object({
        token: z.uuid(),
        question_id: z.uuid(),
        response_id: z.uuid(),
        receipt: z.string().min(32).max(100),
      })
      .parse(Object.fromEntries(form));
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > 2097152)
      throw Error("Choose a file up to 2 MB.");
    const types: Record<string, string> = {
      "application/pdf": "pdf",
      "image/png": "png",
      "image/jpeg": "jpg",
      "text/plain": "txt",
    };
    if (!types[file.type]) throw Error("Choose PDF, PNG, JPEG or plain text.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const magic = new TextDecoder().decode(bytes.slice(0, 8));
    if (
      (file.type === "application/pdf" && !magic.startsWith("%PDF-")) ||
      (file.type === "image/png" &&
        !(bytes[0] === 137 && magic.slice(1, 4) === "PNG")) ||
      (file.type === "image/jpeg" &&
        !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)) ||
      (file.type === "text/plain" && bytes.some((x) => x === 0))
    )
      throw Error("The file contents do not match the selected format.");
    const auth = await account(req, false);
    const loaded = await broker({
      op: "load",
      token: fields.token,
      user_id: auth?.user.id || null,
    });
    const schema = validateForm(loaded.schema);
    const q = schema.questions.find(
      (q) => q.id === fields.question_id && q.type === "file",
    );
    if (!q) throw Error("File question unavailable.");
    const answers: Answers = JSON.parse(String(form.get("answers") || "{}"));
    if (!visibleQuestions(schema, answers).some((x) => x.id === q.id))
      throw Error("This question is not currently visible.");
    const id = crypto.randomUUID(),
      path = `${loaded.id}/${randomBytes(32).toString("hex")}.${types[file.type]}`;
    await broker(
      {
        op: "register",
        id,
        form_id: loaded.id,
        version_id: loaded.version_id,
        response_id: fields.response_id,
        question_id: q.id,
        path,
        filename: file.name,
        mime: file.type,
        bytes: file.size,
        receipt_hash: hash(fields.receipt),
      },
      "native_attachment_broker",
    );
    const { error } = await database()
      .storage.from("office-form-uploads")
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (error) throw Error("The private upload failed. Please retry.");
    return Response.json(
      { id, name: file.name, scan: "not_scanned" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
