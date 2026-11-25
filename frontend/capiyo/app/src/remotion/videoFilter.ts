import { DEFAULT_LOOK, type VideoFrameSettings, type VideoLook, type VideoShade } from "../../../captions/src/VideoFrameSettings";

/**
 * The Video tab (framing, color look, shades, vignette) as an FFmpeg filter, so the final render keeps the cheap
 * caption-strip pipeline: FFmpeg frames the footage and lays the shades on it, then the caption strip goes on
 * top — the same order as the preview (video, shades, captions). The math follows the preview's CSS
 * (captions/src/SourceVideo.tsx, captions/src/VideoFrame.tsx):
 *  - fill / fit: object-fit cover / contain at object-position x% y%, scaled by zoom around that point, mirrored
 *    around it when flipped; a fitted video sits on a blurred, darkened copy (or a plain color);
 *  - look: CSS brightness() / contrast() / saturate() / hue-rotate() in that order, with CSS's own matrices;
 *  - shades and vignette: the same eased stops; each is computed once (one frame) and looped.
 *
 * Returns filter statements reading `[vin]` (the uploaded video) and writing `[vout]` (width x height). The fused
 * render Lambda takes it as `videoFilter` (render-test/fused/index.mjs).
 */
const f = (x: number) => x.toFixed(4);

/** A 3x3 color matrix as colorchannelmixer. */
const mixer = (m: number[]) => `colorchannelmixer=rr=${f(m[0])}:rg=${f(m[1])}:rb=${f(m[2])}:gr=${f(m[3])}:gg=${f(m[4])}:gb=${f(m[5])}:br=${f(m[6])}:bg=${f(m[7])}:bb=${f(m[8])}`;
const saturate = (s: number) => [.213 + .787 * s, .715 - .715 * s, .072 - .072 * s, .213 - .213 * s, .715 + .285 * s, .072 - .072 * s, .213 - .213 * s, .715 - .715 * s, .072 + .928 * s];
const hueRotate = (deg: number) => {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [.213 + c * .787 - s * .213, .715 - c * .715 - s * .715, .072 - c * .072 + s * .928,
    .213 - c * .213 + s * .143, .715 + c * .285 + s * .140, .072 - c * .072 - s * .283,
    .213 - c * .213 - s * .787, .715 - c * .715 + s * .715, .072 + c * .928 + s * .072];
};
/** CSS brightness, contrast, saturate, hue-rotate as filters; "" when the look is untouched. */
function lookFilters(look: VideoLook) {
  const b = look.brightness / 100, c = look.contrast / 100, s = look.saturation / 100, hue = look.hue ?? 0;
  if (b === 1 && c === 1 && s === 1 && !hue) return "";
  const parts = ["format=gbrp"];
  if (b !== 1) parts.push(`colorchannelmixer=rr=${f(b)}:gg=${f(b)}:bb=${f(b)}`);
  if (c !== 1) { const e = `'clip(val*${f(c)}+${f(128 * (1 - c))},0,255)'`; parts.push(`lutrgb=r=${e}:g=${e}:b=${e}`); }
  if (s !== 1) parts.push(mixer(saturate(s)));
  if (hue) parts.push(mixer(hueRotate(hue)));
  return "," + parts.join(",");
}

export function videoFilter(frame: VideoFrameSettings, { width: W, height: H, fps }: { width: number; height: number; fps: number }) {
  const steps: string[] = [];
  let n = 0;
  const next = () => `vf${n++}`;
  const look = lookFilters({ ...DEFAULT_LOOK, ...frame.look });
  const z = Math.max(1, Math.min(4, frame.zoom || 1));
  const px = frame.x / 100, py = frame.y / 100;
  const flip = frame.flipX ? "hflip," : "";
  // Scaled to cover (or fit inside) the frame, times zoom; even sizes, never under the frame when covering.
  const scale = (pick: "max" | "min", k = z) => `scale=w='ceil(iw*${pick}(${W}/iw,${H}/ih)*${k}/2)*2':h='ceil(ih*${pick}(${W}/iw,${H}/ih)*${k}/2)*2'`;
  // Left edge of the picture: px*(W-w); mirrored around the same point it is px*(W+w)-w.
  const left = (w: string, frameW: string) => frame.flipX ? `${f(px)}*(${frameW}+${w})-${w}` : `${f(px)}*(${frameW}-${w})`;
  const top = (h: string, frameH: string) => `${f(py)}*(${frameH}-${h})`;

  let label: string;
  if (frame.fit !== "fit") {
    label = next();
    steps.push(`[vin]${flip}${scale("max")},crop=${W}:${H}:'clip(-(${left("iw", String(W))}),0,iw-${W})':'clip(-(${top("ih", String(H))}),0,ih-${H})'${look}[${label}]`);
  } else {
    const fg = next(), bg = next(), out = next();
    if (frame.backdrop === "color") {
      const hex = /^#([0-9a-f]{6})$/i.exec(frame.backdropColor)?.[1] ?? "000000";
      steps.push(`color=c=0x${hex}:s=${W}x${H}:r=${fps}[${bg}]`);
      steps.push(`[vin]${flip}${scale("min")}${look}[${fg}]`);
    } else {
      const a = next(), b = next();
      steps.push(`[vin]split[${a}][${b}]`);
      steps.push(`[${a}]${flip}${scale("min")}${look}[${fg}]`);
      // CSS: cover, scale(1.18), blur(28px) brightness(0.62) saturate(1.15).
      steps.push(`[${b}]${scale("max", 1.18)},crop=${W}:${H},gblur=sigma=28,format=gbrp,colorchannelmixer=rr=.62:gg=.62:bb=.62,${mixer(saturate(1.15))}[${bg}]`);
    }
    steps.push(`[${bg}][${fg}]overlay=x='${left("w", "W")}':y='${top("h", "H")}':shortest=1:format=auto[${out}]`);
    label = out;
  }

  // One still RGBA layer from an alpha expression, made once and repeated for every frame.
  const layer = (color: string, alpha: string) => {
    const value = /^#([0-9a-f]{6})$/i.exec(color)?.[1] ?? "000000";
    const [r, g, b] = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16));
    const src = next(), out = next();
    steps.push(`color=c=black:s=${W}x${H}:r=${fps},format=rgba,geq=r=${r}:g=${g}:b=${b}:a='${alpha}',trim=end_frame=1,loop=loop=-1:size=1,setpts=N/(${fps}*TB)[${src}]`);
    steps.push(`[${label}][${src}]overlay=0:0:format=auto:eof_action=repeat[${out}]`);
    label = out;
  };
  // Piecewise-linear stops [position, value] of variable ld(0), as nested ifs.
  const ramp = (stops: [number, number][], after: number) => {
    let expr = String(after);
    for (let i = stops.length - 1; i > 0; i--) {
      const [p0, v0] = stops[i - 1], [p1, v1] = stops[i];
      expr = `if(lt(ld(0),${p1}),${v0}+(${v1 - v0})*(ld(0)-${p0})/${p1 - p0},${expr})`;
    }
    return `if(lt(ld(0),${stops[0][0]}),${stops[0][1]},${expr})`;
  };
  const SHADE_STOPS: [number, number][] = [[0, 1], [18, .82], [36, .6], [56, .36], [76, .16], [90, .05], [100, 0]];
  const shade = (item: VideoShade, fromBottom: boolean) => {
    if (!item.on || item.strength <= 0) return;
    const a = 255 * item.strength / 100;
    const at = fromBottom ? `(H-1-Y)/(${item.height / 100}*H)*100` : `Y/(${item.height / 100}*H)*100`;
    layer(item.color, `st(0,${at});${a.toFixed(2)}*${ramp(SHADE_STOPS, 0)}`);
  };
  shade(frame.bottomShade, true);
  shade(frame.topShade, false);
  if (frame.vignette.on && frame.vignette.strength > 0) {
    const k = frame.vignette.strength / 100;
    const stops: [number, number][] = [[0.45, 0], [0.78, 255 * k * .55], [1, 255 * k * .9]];
    layer("#000000", `st(0,hypot((X-W/2)/(0.75*W),(Y-H/2)/(0.7*H)));${ramp(stops, 255 * k * .9)}`);
  }
  steps.push(`[${label}]null[vout]`);
  return steps.join(";");
}
