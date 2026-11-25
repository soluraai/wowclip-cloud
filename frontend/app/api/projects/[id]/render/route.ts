import { captionStrip } from "../../../../../capiyo/app/src/remotion/strip";
import { videoFilter } from "../../../../../capiyo/app/src/remotion/videoFilter";
import { renderableProps } from "../../../../../capiyo/app/src/remotion/renderProps";
import { renderFlagOf } from "../../../../../capiyo/app/src/remotion/renderFlags";
import { readVideoFrame } from "../../../../../capiyo/app/src/app/videoSettings";
import { captionStyle } from "../../../../../capiyo/app/src/app/styleCatalog";
import type { CaptionSettings } from "../../../../../capiyo/app/src/app/captionSettings";

// "Render reel" in Capiyo's editor (the clip window calls POST /api/projects/<id>/render, answers {render_id}).
//
// Planning the render is Capiyo's own code: this is plan() from Capiyo's server/renders.ts, using the same helpers
// (caption strip, video filter, render flags, render-site links), so the reel is drawn exactly like Capiyo draws it.
// The planned job is then handed to the Python backend, which writes job.json to S3, starts the Lambdas,
// follows them and saves the finished reel to the render history (backend/editor/export_reel.py). The clip window then
// follows the render at /api/renders/<render_id>.

const BACKEND = "http://127.0.0.1:5000";
const FPS = 30;
// ₹ for one second of Capiyo's render Lambda: turns a style's measured render cost into render seconds (Capiyo's number).
const INR_PER_LAMBDA_SECOND = 0.00195;

type RenderRequest = {
  inputProps: Record<string, unknown>;
  settings: CaptionSettings;
  largestSize?: number;
  lines?: number;
  video?: unknown;
  /** Render the AI edit (B-roll, graphics, zooms, cuts) full-frame instead of captions over the clip. */
  edit?: boolean;
};

type Context = { params: Promise<{ id: string }> };

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

// Capiyo's renderSize: the output frame has its short side at 1080; a shape picked in the editor wins.
function renderSize(width: number, height: number, ratio?: number) {
  if (ratio) [width, height] = [ratio, 1];
  if (!(width > 0 && height > 0)) return { width: 1080, height: 1920 };
  return width >= height ? { width: even((1080 * width) / height), height: 1080 } : { width: 1080, height: even((1080 * height) / width) };
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function backend(path: string, init: RequestInit = {}) {
  const response = await fetch(`${BACKEND}${path}`, { cache: "no-store", ...init });
  const data = await response.json().catch(() => null);
  return { response, data };
}

const problem = (error: string, status: number) => Response.json({ error }, { status });

async function plan(projectId: string, project: { duration: number; width: number; height: number }, body: RenderRequest, publicBase: string) {
  const inputProps = body.inputProps;
  const styleId = inputProps.styleId as string;
  const frame = readVideoFrame(body.video);
  const { width, height } = renderSize(project.width, project.height, frame.ratio);
  const frames = Math.max(1, Math.floor(project.duration * FPS));
  const flag = renderFlagOf(styleId);
  const textEffects = (inputProps.presentationConfig as { textEffects?: { blend?: string } } | undefined)?.textEffects;
  const picked = textEffects?.blend && textEffects.blend !== "normal" ? textEffects.blend : null;
  const blend = picked ?? flag.blend ?? null;
  const lines = Math.max(1, Math.min(4, Number(body.lines) || body.settings.maxLines || 2));
  const largestSize = Math.max(body.settings.size, Number(body.largestSize) || 0);
  const strip = captionStrip({ settings: body.settings, width, height, largestSize, lines });
  const sourceConfig = { ...(inputProps.sourceConfig as object), background: undefined };
  const props = renderableProps({ ...inputProps, sourceConfig }, publicBase);
  const appBand = { props, top: strip.top, height: strip.height, width, frameHeight: height, frames, ...(blend && { blendSheet: true }) };
  const filter = videoFilter(frame, { width, height, fps: FPS });
  const edit = body.edit === true;
  const fingerprint = await sha256(JSON.stringify({ v: 1, project: projectId, duration: project.duration, appBand, filter, blend, gl: flag.gl, edit }));
  return {
    id: fingerprint.slice(0, 24),
    edit,
    styleId,
    styleName: captionStyle(styleId)?.name ?? styleId,
    frames,
    width,
    height,
    speed: (flag.inr ?? 1.2) / INR_PER_LAMBDA_SECOND / 60,
    job: { inputProps: appBand, top: strip.top, height: strip.height, width, gl: flag.gl, blend, videoFilter: filter },
  };
}

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as RenderRequest | null;
  const styleId = body?.inputProps?.styleId;
  if (!body || typeof styleId !== "string" || !styleId || !body.settings || typeof body.settings !== "object")
    return problem("This render request isn't valid.", 400);

  const [opened, site] = await Promise.all([backend(`/projects/${encodeURIComponent(id)}?light=1`), backend("/render-site")]);
  if (!opened.response.ok) return Response.json(opened.data ?? { error: "The wowclip backend is not answering." }, { status: opened.response.status });
  const project = opened.data.project;
  if (project.status !== "ready") return problem("This clip is still being prepared. Try again in a moment.", 409);

  const planned = await plan(id, project, body, site.data.public_base);
  const started = await backend(`/projects/${encodeURIComponent(id)}/render-job`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planned }),
  });
  return Response.json(started.data ?? { error: "The wowclip backend is not answering." }, { status: started.response.status });
}
