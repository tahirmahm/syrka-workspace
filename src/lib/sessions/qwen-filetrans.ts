import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { qwenConfiguration, qwenSpeechReady, QwenRequestError } from "./qwen";

function origin() {
  if (!qwenSpeechReady())
    throw Error("Qwen transcription requires confirmed protected free quota.");
  return new URL(qwenConfiguration().baseURL).origin;
}
async function request(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${qwenConfiguration().key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    redirect: "error",
    signal: AbortSignal.timeout(25000),
  });
  const data: unknown = await response.json().catch(() => null);
  const error =
    data && typeof data === "object" && "code" in data ? String(data.code) : "";
  if (!response.ok || error)
    throw new QwenRequestError(
      response.status,
      /FreeTierOnly|AllocationQuota|quota/i.test(error),
    );
  return data;
}
export async function submitFileTranscription(
  audioURL: string,
  language: string,
) {
  if (!["en", "hi", "ar", "fr", "de", "zh", "es"].includes(language))
    throw Error("This language is not documented for Qwen file transcription.");
  if (qwenConfiguration().uploadModel !== "qwen3-asr-flash-filetrans")
    throw Error("Choose the approved qwen3-asr-flash-filetrans upload model.");
  const data = await request(
    `${origin()}/api/v1/services/audio/asr/transcription`,
    {
      method: "POST",
      headers: { "X-DashScope-Async": "enable" },
      body: JSON.stringify({
        model: "qwen3-asr-flash-filetrans",
        input: { file_url: audioURL },
        parameters: {
          channel_id: [0],
          language,
          enable_itn: false,
          enable_words: true,
        },
      }),
    },
  );
  return z.object({ output: z.object({ task_id: z.uuid() }) }).parse(data)
    .output.task_id;
}
export const bindingSchema = z.object({
  task_id: z.uuid(),
  audio_path: z.string().max(500),
  expires: z.number(),
  language: z.string().max(10),
});
export type FileBinding = z.infer<typeof bindingSchema>;
export function signFileBinding(
  binding: FileBinding,
  job: string,
  room: string,
  actor: string,
) {
  return createHmac("sha256", qwenConfiguration().key)
    .update(
      JSON.stringify([
        "syrka-filetrans-v1",
        job,
        room,
        actor,
        binding.task_id,
        binding.audio_path,
        binding.language,
        binding.expires,
      ]),
    )
    .digest("hex");
}
export function verifyFileBinding(
  input: unknown,
  job: string,
  room: string,
  actor: string,
) {
  const data = z
    .object({
      binding: bindingSchema,
      signature: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .parse(input);
  const expected = Buffer.from(
    signFileBinding(data.binding, job, room, actor),
    "hex",
  );
  if (
    !timingSafeEqual(expected, Buffer.from(data.signature, "hex")) ||
    Date.now() > data.binding.expires
  )
    throw Error(
      "This audio processing reference is invalid or expired. Submit a fresh permitted import.",
    );
  if (!data.binding.audio_path.startsWith(`${actor}/${room}/`))
    throw Error("Audio ownership mismatch.");
  return data.binding;
}
const sentence = z.object({
  begin_time: z.number().int().min(0),
  end_time: z.number().int().positive(),
  text: z.string().max(16000),
  language: z.string().optional(),
});
export function parseFileTranscript(input: unknown, language: string) {
  const data = z
    .object({
      transcripts: z.array(z.object({ sentences: z.array(sentence) })).min(1),
    })
    .parse(input);
  const lines = data.transcripts.flatMap((t) => t.sentences);
  if (lines.length > 3000)
    throw Error(
      "This import exceeds the 3,000-segment limit. Split the source recording.",
    );
  return lines.map((s) => {
    if (s.end_time <= s.begin_time)
      throw Error("Qwen returned invalid sentence timestamps.");
    return {
      start_ms: s.begin_time,
      end_ms: s.end_time,
      original_text: s.text,
      language: s.language || language,
      speaker_name: "Unknown (uploaded audio; no verified speaker attribution)",
      speaker_id: null,
      source_kind: "manual",
    };
  });
}
export async function pollFileTranscription(task: string, language: string) {
  z.uuid().parse(task);
  const data = z
    .object({
      output: z.object({
        task_status: z.string(),
        result: z.object({ transcription_url: z.string() }).optional(),
        code: z.string().optional(),
      }),
    })
    .parse(await request(`${origin()}/api/v1/tasks/${task}`));
  if (["PENDING", "RUNNING"].includes(data.output.task_status))
    return { state: "running" as const };
  if (data.output.task_status !== "SUCCEEDED")
    throw new QwenRequestError(
      400,
      /FreeTierOnly|AllocationQuota|quota/i.test(data.output.code || ""),
    );
  const url = new URL(data.output.result?.transcription_url || "");
  // Provider-owned result storage only; never fetch a client-supplied arbitrary URL.
  if (
    !url.hostname.endsWith(".aliyuncs.com") ||
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  )
    throw Error("Unexpected speech result host.");
  url.protocol = "https:";
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw Error("Qwen transcription result could not be downloaded.");
  if (Number(response.headers.get("content-length")) > 4000000)
    throw Error("Transcript result exceeds the supported size.");
  const body = await response.text();
  if (body.length > 4000000)
    throw Error("Transcript result exceeds the supported size.");
  return {
    state: "done" as const,
    segments: parseFileTranscript(JSON.parse(body), language),
  };
}
