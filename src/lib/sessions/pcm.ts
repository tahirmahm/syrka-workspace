// Browser-only. The stream is the authenticated participant's existing LiveKit microphone.
export async function capturePcm(
  track: MediaStreamTrack,
  send: (blob: Blob, start: number, end: number) => void,
  startedAt: string,
  onState?: (state: AudioContextState, resume: () => void) => void,
) {
  const context = new AudioContext({ sampleRate: 16000 });
  try {
    if (context.sampleRate !== 16000)
      throw Error("This browser cannot capture 16 kHz speech audio.");
    await context.audioWorklet.addModule(
      "/workspace/audio/session-pcm-worklet.js",
    );
    const source = context.createMediaStreamSource(new MediaStream([track]));
    const processor = new AudioWorkletNode(context, "syrka-pcm");
    const silent = context.createGain();
    silent.gain.value = 0;
    const origin = Math.max(0, Date.now() - Date.parse(startedAt));
    processor.port.onmessage = ({
      data,
    }: {
      data: { buffer: ArrayBuffer; startSample: number; endSample: number };
    }) =>
      send(
        new Blob([data.buffer], { type: "audio/pcm" }),
        Math.floor(origin + data.startSample / 16),
        Math.floor(origin + data.endSample / 16),
      );
    source.connect(processor);
    processor.connect(silent);
    silent.connect(context.destination);
    let stopped = false;
    const resume = () => {
      void context.resume().catch(() => {
        if (!stopped) notify();
      });
    };
    const notify = () => {
      if (!stopped) onState?.(context.state, resume);
    };
    context.onstatechange = notify;
    notify();
    // Safari may require a second explicit gesture. Return cleanup even while suspended.
    resume();
    return () => {
      if (stopped) return;
      stopped = true;
      context.onstatechange = null;
      processor.port.onmessage = null;
      source.disconnect();
      processor.disconnect();
      silent.disconnect();
      if (context.state !== "closed") void context.close().catch(() => {});
    };
  } catch (e) {
    await context.close();
    throw e;
  }
}
