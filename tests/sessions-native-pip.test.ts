import { expect, test, vi, afterEach } from "vitest";
import {
  activeNativePip,
  enterNativePip,
  exitNativePip,
  nativePipKind,
  type PipVideo,
} from "../src/lib/sessions/native-pip";
function fixture() {
  const video = Object.assign(new EventTarget(), {
    readyState: 4,
    videoWidth: 640,
    playsInline: false,
    srcObject: { fixtureTrack: "owned-LiveKit-video" },
  }) as unknown as PipVideo;
  const document = {
    pictureInPictureEnabled: false,
    pictureInPictureElement: null,
  } as unknown as Document;
  return { video, document };
}
afterEach(() => vi.useRealTimers());
test("standard PiP requests the existing video and closes only its owned presentation", async () => {
  const { video, document } = fixture();
  Object.assign(document, { pictureInPictureEnabled: true });
  video.requestPictureInPicture = vi.fn(async () => {
    Object.assign(document, { pictureInPictureElement: video });
    return {} as PictureInPictureWindow;
  });
  document.exitPictureInPicture = vi.fn(async () => {
    Object.assign(document, { pictureInPictureElement: null });
  });
  const stream = video.srcObject;
  expect(await enterNativePip(video, document)).toBe("standard");
  expect(video.requestPictureInPicture).toHaveBeenCalledOnce();
  expect(video.playsInline).toBe(true);
  expect(video.srcObject).toBe(stream);
  expect(activeNativePip(video, document)).toBe(true);
  await exitNativePip(video, document);
  expect(document.exitPictureInPicture).toHaveBeenCalledOnce();
  Object.assign(document, { pictureInPictureElement: {} });
  await exitNativePip(video, document);
  expect(document.exitPictureInPicture).toHaveBeenCalledOnce();
});
test("WebKit uses the actual presentation-mode API in the click stack and handles its void return", async () => {
  const { video, document } = fixture();
  video.webkitSupportsPresentationMode = vi.fn(() => true);
  video.webkitSetPresentationMode = vi.fn((mode) => {
    video.webkitPresentationMode = mode;
    video.dispatchEvent(new Event("webkitpresentationmodechanged"));
  });
  const result = enterNativePip(video, document);
  expect(video.webkitSetPresentationMode).toHaveBeenCalledWith(
    "picture-in-picture",
  );
  expect(await result).toBe("webkit");
  expect(activeNativePip(video, document)).toBe(true);
  await exitNativePip(video, document);
  expect(video.webkitPresentationMode).toBe("inline");
});
test("unsupported MediaStreams and unready video never report native PiP success", async () => {
  const { video, document } = fixture();
  video.webkitSupportsPresentationMode = () => false;
  video.webkitSetPresentationMode = vi.fn();
  expect(nativePipKind(video, document)).toBeNull();
  await expect(enterNativePip(video, document)).rejects.toThrow(
    "does not support",
  );
  expect(video.webkitSetPresentationMode).not.toHaveBeenCalled();
  Object.assign(video, { readyState: 0 });
  await expect(enterNativePip(video, document)).rejects.toThrow("No playable");
});
test("blocked or ignored native requests remain failures instead of claiming a system window", async () => {
  const { video, document } = fixture();
  Object.assign(document, { pictureInPictureEnabled: true });
  video.requestPictureInPicture = vi.fn(async () => {
    throw new Error("NotAllowedError");
  });
  await expect(enterNativePip(video, document)).rejects.toThrow(
    "NotAllowedError",
  );
  Object.assign(document, { pictureInPictureEnabled: false });
  video.webkitSupportsPresentationMode = () => true;
  video.webkitSetPresentationMode = () => {};
  vi.useFakeTimers();
  const request = enterNativePip(video, document);
  const assertion = expect(request).rejects.toThrow("did not enter");
  await vi.advanceTimersByTimeAsync(710);
  await assertion;
});
test("missing and throwing cleanup APIs never crash a call", async () => {
  const { video, document } = fixture();
  Object.assign(document, { pictureInPictureElement: video });
  await expect(exitNativePip(video, document)).resolves.toBeUndefined();
  document.exitPictureInPicture = () => {
    throw Error("blocked");
  };
  await expect(exitNativePip(video, document)).resolves.toBeUndefined();
});
