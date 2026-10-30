import { z } from "zod";

export const QWEN_TEXT_MODEL = "qwen3.8-flash";
export const QWEN_ASR_MODEL = "qwen-audio-3.0-asr-flash";
export function qwenConfiguration() {
  return {
    key: process.env.SYRKA_AI_API_KEY || process.env.QWEN_API_KEY || "",
    baseURL: (
      process.env.SYRKA_AI_BASE_URL ||
      process.env.QWEN_BASE_URL ||
      ""
    ).replace(/\/$/, ""),
    model: process.env.SYRKA_AI_MODEL || QWEN_TEXT_MODEL,
    asrModel: process.env.SYRKA_STT_MODEL || "qwen3-asr-flash-realtime",
    uploadModel:
      process.env.SYRKA_STT_UPLOAD_MODEL || "qwen3-asr-flash-filetrans",
  };
}
export function validQwenEndpoint(baseURL: string) {
  try {
    const url = new URL(baseURL);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      (url.hostname === "dashscope-intl.aliyuncs.com" ||
        /^[a-zA-Z0-9-]+\.ap-southeast-1\.maas\.aliyuncs\.com$/.test(
          url.hostname,
        )) &&
      url.pathname.replace(/\/$/, "") === "/compatible-mode/v1"
    );
  } catch {
    return false;
  }
}
export function qwenReady() {
  const config = qwenConfiguration();
  return Boolean(
    process.env.SYRKA_FREE_TIER_CONFIRMED === "true" &&
    Number(process.env.SYRKA_AI_DAILY_BUDGET || 0) === 0 &&
    config.model === QWEN_TEXT_MODEL &&
    config.key &&
    !config.key.startsWith("sk-sp-") &&
    validQwenEndpoint(config.baseURL) &&
    process.env.SYRKA_AI_FREE_QUOTA_ONLY_CONFIRMED === "true" &&
    Date.now() <
      Date.parse(
        process.env.SYRKA_FREE_QUOTA_EXPIRES_AT || "2027-01-29T00:00:00Z",
      ),
  );
}
// Published 3.0 pricing explicitly says no free quota. Never infer eligibility from an API key.
export function qwenAsrEligible(model: string) {
  return [
    "qwen-audio-3.1-asr-flash",
    "qwen3-asr-flash",
    "qwen3-asr-flash-realtime",
  ].includes(model);
}
export function qwenSpeechReady() {
  return (
    qwenReady() &&
    process.env.SYRKA_STT_FREE_QUOTA_ONLY_CONFIRMED === "true" &&
    qwenAsrEligible(qwenConfiguration().asrModel)
  );
}
export class QwenRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly quota: boolean,
  ) {
    super(
      quota
        ? "Qwen free quota is exhausted, expired or unavailable. Processing stopped; no paid fallback was attempted."
        : status === 401 || status === 403
          ? "Qwen rejected the general-purpose API credentials or model access. Check the Singapore key and endpoint."
          : status === 429
            ? "Qwen rate limit reached. Retry later; your transcript is preserved."
            : "Qwen is unavailable or rejected this request. Your transcript is preserved.",
    );
  }
}
export function providerFailure(error: unknown): QwenRequestError | null {
  if (error instanceof QwenRequestError) return error;
  if (!error || typeof error !== "object") return null;
  const e = error as { statusCode?: number; responseBody?: string };
  if (!e.statusCode) return null;
  return new QwenRequestError(
    e.statusCode,
    /FreeTierOnly|AllocationQuota|quota.*exhaust|insufficient_quota/i.test(
      e.responseBody || "",
    ),
  );
}
const formats: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
};
export async function qwenSpeechRequest(
  blob: Blob,
  language: string,
  model = qwenConfiguration().asrModel,
) {
  const mime = blob.type.split(";")[0];
  const format = formats[mime];
  if (!format || !blob.size || blob.size > 2000000)
    throw Error("Choose supported audio under 2 MB.");
  // Urdu is not listed for these models. Do not present a language hint as support.
  if (language === "ur")
    throw Error(
      "Urdu transcription is not documented for the configured Qwen speech model.",
    );
  const data = `data:${mime};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`;
  const { baseURL } = qwenConfiguration();
  if (!validQwenEndpoint(baseURL))
    throw Error("Configure the Singapore OpenAI-compatible Qwen endpoint.");
  const audio = {
    role: "user",
    content: [{ type: "input_audio", input_audio: { data } }],
  };
  if (model === "qwen3-asr-flash")
    return {
      url: `${baseURL}/chat/completions`,
      body: {
        model,
        messages: [audio],
        stream: false,
        asr_options: { language, enable_itn: false },
      },
    };
  if (![QWEN_ASR_MODEL, "qwen-audio-3.1-asr-flash"].includes(model))
    throw Error(
      "Unsupported Qwen speech model; realtime requires a separate transport.",
    );
  return {
    url: `${new URL(baseURL).origin}/api/v1/services/aigc/multimodal-generation/generation`,
    body: {
      model,
      input: { messages: [audio] },
      parameters: { format, language_hints: [language] },
    },
  };
}
export function parseQwenSpeech(
  data: unknown,
  model: string,
  language: string,
) {
  const text =
    model === "qwen3-asr-flash"
      ? z
          .object({
            choices: z
              .array(
                z.object({
                  message: z.object({ content: z.string().max(16000) }),
                }),
              )
              .min(1),
          })
          .parse(data).choices[0].message.content
      : z
          .object({ output: z.object({ text: z.string().max(16000) }) })
          .parse(data).output.text;
  // These endpoints do not reliably return a detected language code: retain the explicit hint.
  return { text, language };
}
export async function transcribeQwen(blob: Blob, language: string) {
  if (!qwenSpeechReady())
    throw Error(
      qwenConfiguration().asrModel === QWEN_ASR_MODEL
        ? "qwen-audio-3.0-asr-flash has no published free quota and is disabled under the zero-cost policy."
        : "Qwen speech requires confirmed model-specific Free Quota Only protection.",
    );
  const request = await qwenSpeechRequest(blob, language);
  const response = await fetch(request.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${qwenConfiguration().key}`,
      "Content-Type": "application/json",
      "X-DashScope-SSE": "disable",
    },
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(35000),
    redirect: "error",
  });
  const data: unknown = await response.json().catch(() => null);
  const code =
    data && typeof data === "object" && "code" in data ? String(data.code) : "";
  if (!response.ok || code)
    throw new QwenRequestError(
      response.status,
      /FreeTierOnly|AllocationQuota|quota/i.test(code),
    );
  return parseQwenSpeech(data, qwenConfiguration().asrModel, language);
}
