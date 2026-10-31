export type SpeechProgress = {
  state: "off" | "listening" | "processing" | "error";
  detail: string;
  bytes?: number;
  receivedBytes?: number;
  characters?: number;
  savedSegments?: number;
  batches?: number;
  resume?: () => void;
};
