import type { OfficeFile } from "./model";
const key = (file: OfficeFile) =>
  `syrka-write-recovery-v1:${file.owner_id}:${file.id}`;
export function readWriteRecovery(file: OfficeFile): OfficeFile | null {
  try {
    const raw = localStorage.getItem(key(file));
    if (!raw) return null;
    const draft = JSON.parse(raw) as OfficeFile;
    if (
      draft.id !== file.id ||
      draft.owner_id !== file.owner_id ||
      draft.kind !== "doc" ||
      typeof draft.content !== "object" ||
      !draft.content
    )
      return null;
    if (Date.now() - Date.parse(draft.updated_at) > 7 * 86400000) {
      localStorage.removeItem(key(file));
      return null;
    }
    if (Date.parse(draft.updated_at) <= Date.parse(file.updated_at))
      return null;
    return draft;
  } catch {
    return null;
  }
}
export function storeWriteRecovery(file: OfficeFile) {
  if (file.kind === "doc")
    localStorage.setItem(key(file), JSON.stringify(file));
}
export function clearWriteRecovery(file: OfficeFile) {
  localStorage.removeItem(key(file));
}
