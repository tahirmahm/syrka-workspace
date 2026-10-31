import { expect, test } from "vitest";
import { TrackSource } from "@livekit/protocol";
import { mediaSources } from "../src/lib/sessions/media-permissions";
test("admitted participants can present with audio by default; restricted presentation keeps camera and mic", () => {
  expect(mediaSources()).toEqual([
    TrackSource.CAMERA,
    TrackSource.MICROPHONE,
    TrackSource.SCREEN_SHARE,
    TrackSource.SCREEN_SHARE_AUDIO,
  ]);
  expect(mediaSources(false)).toEqual([
    TrackSource.CAMERA,
    TrackSource.MICROPHONE,
  ]);
});
