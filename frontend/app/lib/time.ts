// 75 -> "1:15"
export function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// "1:15" -> 75, "1:02:30" -> 3750, "90" -> 90. Returns null when the text is not a time.
export function parseTime(text: string): number | null {
  const parts = text.trim().split(":");
  if (parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + Number(part);
  return seconds;
}
