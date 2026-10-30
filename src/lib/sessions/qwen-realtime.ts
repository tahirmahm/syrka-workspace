import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import { qwenConfiguration, qwenSpeechReady, QwenRequestError } from "./qwen";

/** Bounded outbound connection per PCM batch; Vercel never hosts a WebSocket server. */
export async function transcribeRealtimePcm(blob: Blob, language: string) {
  if (!qwenSpeechReady())
    throw Error(
      "Qwen live speech is not configured with protected free quota.",
    );
  if (
    blob.type !== "audio/pcm" ||
    blob.size < 3200 ||
    blob.size > 640000 ||
    blob.size % 2
  )
    throw Error("Live audio must be mono 16 kHz signed PCM16, 0.1–20 seconds.");
  if (!["en", "hi", "ar", "fr", "de", "zh", "es"].includes(language))
    throw Error("This language is not documented for Qwen live ASR.");
  const config = qwenConfiguration();
  const url = new URL(config.baseURL);
  url.protocol = "wss:";
  url.pathname = "/api-ws/v1/realtime";
  url.search = "?model=qwen3-asr-flash-realtime";
  const pcm = Buffer.from(await blob.arrayBuffer());
  return new Promise<{ text: string; language: string }>((resolve, reject) => {
    let final = "",
      settled = false;
    const ws = new WebSocket(url, {
      headers: { Authorization: `Bearer ${config.key}` },
      handshakeTimeout: 10000,
      maxPayload: 1000000,
      perMessageDeflate: false,
    });
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "Qwen live speech timed out. This audio batch was not saved; existing transcripts are intact.",
          ),
        ),
      35000,
    );
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.terminate();
      if (error) reject(error);
      else resolve({ text: final, language });
    }
    const send = (value: Record<string, unknown>) =>
      ws.send(JSON.stringify({ event_id: randomUUID(), ...value }));
    ws.on("open", () =>
      send({
        type: "session.update",
        session: {
          input_audio_format: "pcm",
          sample_rate: 16000,
          input_audio_transcription: { language },
          turn_detection: null,
        },
      }),
    );
    ws.on("unexpected-response", (_, response) => {
      let body = "";
      response.on("data", (chunk) => {
        if (body.length < 8000) body += chunk;
      });
      response.on("end", () =>
        finish(
          new QwenRequestError(
            response.statusCode || 502,
            /FreeTierOnly|AllocationQuota|quota/i.test(body),
          ),
        ),
      );
    });
    ws.on("error", () =>
      finish(
        new Error(
          "Qwen live speech connection failed. No paid fallback was attempted.",
        ),
      ),
    );
    ws.on("close", () => {
      if (!settled)
        finish(
          new Error("Qwen live speech disconnected before final recognition."),
        );
    });
    ws.on("message", (bytes) => {
      try {
        const event = JSON.parse(bytes.toString());
        if (event.type === "session.updated") {
          for (let offset = 0; offset < pcm.length; offset += 3200)
            send({
              type: "input_audio_buffer.append",
              audio: pcm.subarray(offset, offset + 3200).toString("base64"),
            });
          send({ type: "input_audio_buffer.commit" });
        } else if (
          event.type === "conversation.item.input_audio_transcription.completed"
        ) {
          if (
            typeof event.transcript !== "string" ||
            event.transcript.length > 16000
          )
            throw Error("Invalid live transcription response.");
          final += event.transcript;
          send({ type: "session.finish" });
        } else if (event.type === "session.finished") finish();
        else if (event.type === "error")
          finish(
            new QwenRequestError(
              400,
              /FreeTierOnly|AllocationQuota|quota/i.test(
                event.error?.code || "",
              ),
            ),
          );
      } catch {
        finish(new Error("Qwen returned an invalid live speech response."));
      }
    });
  });
}
