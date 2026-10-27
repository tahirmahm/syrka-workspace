"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  readWriteRecovery,
  storeWriteRecovery,
  clearWriteRecovery,
} from "./write-recovery";
import { saveFile } from "./storage";
import type { OfficeFile } from "./model";
export function useAutosave(
  initial: OfficeFile,
  onSaved: (file: OfficeFile) => void,
) {
  const [file, setFile] = useState(initial);
  const [recovery, setRecovery] = useState(() =>
    initial.kind === "doc" ? readWriteRecovery(initial) : null,
  );
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState("Saved");
  const [error, setError] = useState("");
  const latest = useRef(initial);
  const saved = useRef(JSON.stringify(initial));
  const callback = useRef(onSaved);
  callback.current = onSaved;
  const queue = useRef(Promise.resolve());
  const flush = useCallback(() => {
    const snapshot = latest.current;
    const serialized = JSON.stringify(snapshot);
    if (serialized === saved.current) return queue.current;
    setStatus("Saving…");
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        try {
          await saveFile(snapshot);
          saved.current = serialized;
          callback.current(snapshot);
          if (latest.current === snapshot) {
            setStatus("Saved");
            try {
              clearWriteRecovery(snapshot);
            } catch {}
          }
          setError("");
        } catch (e) {
          setStatus("Save failed");
          setError(e instanceof Error ? e.message : "Could not save");
          throw e;
        }
      });
    return queue.current;
  }, []);
  const update = useCallback((patch: Partial<OfficeFile>) => {
    setFile((prev) => {
      const next = { ...prev, ...patch, updated_at: new Date().toISOString() };
      latest.current = next;
      return next;
    });
    setStatus("Unsaved changes");
  }, []);
  useEffect(() => {
    if (file === initial) return;
    if (file.kind === "doc") {
      try {
        storeWriteRecovery(file);
      } catch {
        /* Autosave continues if device storage is unavailable. */
      }
    }
    const timer = setTimeout(() => {
      void flush().catch(() => {});
    }, 750);
    return () => clearTimeout(timer);
  }, [file, initial, flush]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(latest.current) !== saved.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
  const discardRecovery = () => {
    try {
      clearWriteRecovery(initial);
    } catch {}
    setRecovery(null);
  };
  const restoreRecovery = () => {
    if (!recovery) return;
    update({ name: recovery.name, content: recovery.content });
    setRevision((v) => v + 1);
    setRecovery(null);
  };
  return {
    file,
    update,
    status,
    error,
    flush,
    recovery,
    revision,
    restoreRecovery,
    discardRecovery,
  };
}
