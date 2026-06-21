export function isFutureLogEntry(entry: any): boolean {
  if (!entry || typeof entry !== "object") return false;
  return entry.is_future === true;
}
