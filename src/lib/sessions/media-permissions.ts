import { TrackSource } from "@livekit/protocol";
/** Explicit grants preserve mic/camera while restricting presentation sources. */
export function mediaSources(shareScreen = true) {
  return [
    TrackSource.CAMERA,
    TrackSource.MICROPHONE,
    ...(shareScreen
      ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
      : []),
  ];
}
