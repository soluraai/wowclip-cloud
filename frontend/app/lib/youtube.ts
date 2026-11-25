// Checks that the pasted text is a YouTube video link and pulls out the 11-character video id.
// Runs in the browser only; no network calls.

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"]);

export type ValidationResult = { ok: true; videoId: string } | { ok: false; error: string };

export function validateYouTubeUrl(raw: string): ValidationResult {
  const input = raw.trim();
  if (!input) return { ok: false, error: "Please enter a YouTube video link." };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return { ok: false, error: "This is not a valid link." };
  }

  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return { ok: false, error: "Only YouTube video links are supported." };

  const parts = url.pathname.split("/").filter(Boolean);
  const candidate = host.endsWith("youtu.be")
    ? parts[0] // youtu.be/<id>
    : parts[0] === "watch"
      ? url.searchParams.get("v") // youtube.com/watch?v=<id>
      : parts[0] === "embed"
        ? parts[1] // youtube.com/embed/<id>
        : null;

  if (!candidate || !VIDEO_ID.test(candidate)) {
    return { ok: false, error: "Could not find a valid video id in this link." };
  }
  return { ok: true, videoId: candidate };
}
