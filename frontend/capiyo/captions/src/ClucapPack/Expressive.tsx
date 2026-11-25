import React from "react";
import { clamp, ease, out, type ClucapScene, type ClucapWord } from "./types";
import { SCRIBBLE_COLOR, scribbleArrival, scribbleMark, scribbleOval, scribblePadding } from "./scribbleGeometry";
import { SundayScript } from "./SundayScript";

const glyph = (item: ClucapWord) => ({
  x: item.x + item.inkOffset,
  y: item.baseline,
  fontFamily: item.family,
  fontSize: item.size,
  fontWeight: item.weight,
  fontStyle: item.italic ? "italic" : undefined,
  letterSpacing: item.tracking,
  xmlSpace: "preserve" as const,
  style: { fontSynthesis: "none", fontKerning: "normal", whiteSpace: "pre" } as React.CSSProperties,
});

const Scribble: React.FC<ClucapScene> = ({ cue, uid, now, reducedMotion }) => {
  const mark = scribbleMark(cue);
  return <>
    <defs>
      <filter id={`${uid}-scribble-shadow`} x="-30%" y="-40%" width="160%" height="190%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#11100d" floodOpacity="0.45" />
      </filter>
    </defs>
    {cue.items.map((item) => {
      const progress = reducedMotion ? Number(now >= item.word.startMs) : out((now - item.word.startMs) / scribbleArrival(item.word));
      if (progress === 0) return null;
      const accent = item.word.id === cue.accentWordId;
      const top = item.baseline - item.ascent;
      const height = item.ascent + item.descent;
      const padding = scribblePadding(item.width, item.ascent, item.descent, item.size, mark.kind === "circle");
      const frame = { x: item.x - padding.x, y: top - padding.y, width: item.width + padding.x * 2, height: height + padding.y * 2 };
      const draw = reducedMotion ? 1 : out((now - mark.at) / mark.duration);
      const pen = reducedMotion ? 1 : clamp((now - mark.at) / mark.duration);
      const firstPass = reducedMotion ? 1 : clamp(pen / .72);
      const secondPass = reducedMotion ? 1 : clamp((pen - .59) / .41);
      return <g key={item.word.id} opacity={progress}
        transform={`translate(0 ${(1 - progress) * 3})`}>
        {accent && mark.kind === "highlight" && draw > 0 && <>
          <defs><clipPath id={`${uid}-scribble-mark`}><rect x={frame.x} y={frame.y} width={frame.width * draw} height={frame.height} /></clipPath></defs>
          <rect {...frame} rx={Math.min(12, frame.height * .28)} fill={SCRIBBLE_COLOR} opacity={.92 * draw}
            clipPath={`url(#${uid}-scribble-mark)`} />
        </>}
        <text {...glyph(item)} fill="#fffdf8" filter={`url(#${uid}-scribble-shadow)`}>{item.text}</text>
        {accent && mark.kind === "circle" && pen > 0 && <g fill="none" stroke={SCRIBBLE_COLOR}
          strokeLinecap="round" strokeLinejoin="round">
          <path d={scribbleOval(frame.x, frame.y, frame.width, frame.height, cue.id)} strokeWidth="2.7"
            pathLength="1" strokeDasharray="1 1" strokeDashoffset={1 - firstPass} />
          {secondPass > 0 && <path d={scribbleOval(frame.x, frame.y, frame.width, frame.height, cue.id, 1)}
            strokeWidth="1.9" opacity="0.76" pathLength="1" strokeDasharray="1 1" strokeDashoffset={1 - secondPass} />}
        </g>}
      </g>;
    })}
  </>;
};

const GoldenAura: React.FC<ClucapScene> = (scene) => {
  const { cue, uid, now, reducedMotion, settled, continuousEntry, continuousExit } = scene;
  const elapsed = now - cue.startMs;
  const duration = Math.max(1, cue.endMs - cue.startMs);
  const fadeDuration = Math.min(90, duration * .18);
  const fadeStart = duration - fadeDuration;
  const zoomTime = clamp(elapsed / Math.max(1, fadeStart));
  // Spread the zoom across the complete readable hold, instead of settling in 360ms.
  const slowZoom = .65 * zoomTime + .35 * ease(zoomTime);
  // The line lands with a clear zoom in, then keeps pushing in slowly while it is read.
  const land = continuousEntry ? 1 : out(elapsed / Math.min(340, duration * .4));
  const scale = settled || reducedMotion ? 1 : (.8 + .2 * land) * (1 + .07 * slowZoom);
  const opacity = settled || reducedMotion ? 1 : (continuousEntry ? 1 : out(elapsed / Math.min(150, duration * .25))) *
    (continuousExit ? 1 : 1 - ease((elapsed - fadeStart) / fadeDuration));
  const centerX = cue.box.x + cue.box.width / 2;
  const centerY = cue.box.y + cue.box.height / 2;
  const sheenProgress = clamp((elapsed - 100) / Math.max(1, Math.min(1050, duration * .8)));
  const sheenX = cue.box.x - 90 + (cue.box.width + 180) * sheenProgress;
  const sheenOpacity = settled || reducedMotion ? 0 : Math.sin(sheenProgress * Math.PI) * 0.24;
  // A color picked in the editor replaces the gold, and its glow follows that color.
  const paint = scene.paint;
  const stops: [number, string][] = paint?.gradient ? [...paint.gradient.stops].sort((a, b) => a.position - b.position).map(stop => [stop.position / 100, stop.color])
    : paint?.color ? [[0, paint.color], [1, paint.color]] : [[0, "#fffbd5"], [.38, "#fff68b"], [.68, "#ffe657"], [1, "#f8c633"]];
  const lead = paint ? stops[Math.floor(stops.length / 2)][1] : undefined;
  const glow = lead ? [lead, lead, lead] : ["#f0bc32", "#ffd53d", "#fff7a2"];
  return <>
    <defs>
      <linearGradient id={`${uid}-aura-fill`} x1="0" y1={cue.box.y} x2="0" y2={cue.box.y + cue.box.height}
        gradientUnits="userSpaceOnUse">
        {stops.map(([offset, color]) => <stop key={offset} offset={offset} stopColor={color} />)}
      </linearGradient>
      {/* One filter per word, sized to the word plus 4x the widest blur (14 → 56 units), so Chrome blurs only the
          area the glow can reach instead of 6x the word's box (same picture, far less to paint). */}
      {cue.items.map((item, index) => ({ item, index, accent: item.word.id === cue.accentWordId })).map(({ item, index, accent }) => <filter key={item.word.id}
        id={`${uid}-aura-${index}`} filterUnits="userSpaceOnUse" x={item.x - 56} y={item.baseline - item.size * 1.2 - 56}
        width={item.width + 112} height={item.size * 1.6 + 112} colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2.8" result="shadowBlur" />
        <feOffset in="shadowBlur" dx="0" dy="3" result="shadowOffset" />
        <feFlood floodColor={glow[0]} floodOpacity="0.46" result="shadowColor" />
        <feComposite in="shadowColor" in2="shadowOffset" operator="in" result="shadow" />
        <feGaussianBlur in="SourceAlpha" stdDeviation={accent ? 14 : 11} result="glowBlur" />
        <feFlood floodColor={glow[1]} floodOpacity={accent ? 0.76 : 0.6} result="glowColor" />
        <feComposite in="glowColor" in2="glowBlur" operator="in" result="glow" />
        <feGaussianBlur in="SourceAlpha" stdDeviation="2.6" result="tightBlur" />
        <feFlood floodColor={glow[2]} floodOpacity={accent ? .9 : .78} />
        <feComposite in2="tightBlur" operator="in" result="tightGlow" />
        <feMerge><feMergeNode in="shadow" /><feMergeNode in="glow" /><feMergeNode in="tightGlow" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>)}
      <linearGradient id={`${uid}-aura-sheen`} x1={sheenX - 46} y1="0" x2={sheenX + 46} y2="0"
        gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="white" stopOpacity="0" />
        <stop offset="0.5" stopColor="white" />
        <stop offset="1" stopColor="white" stopOpacity="0" />
      </linearGradient>
      <mask id={`${uid}-aura-sheen-mask`} maskUnits="userSpaceOnUse"
        x={cue.box.x - 50} y={cue.box.y - 40} width={cue.box.width + 100} height={cue.box.height + 80}>
        <rect x={cue.box.x - 50} y={cue.box.y - 40} width={cue.box.width + 100} height={cue.box.height + 80}
          fill={`url(#${uid}-aura-sheen)`} />
      </mask>
    </defs>
    <g opacity={opacity} transform={`translate(${centerX} ${centerY}) scale(${scale}) translate(${-centerX} ${-centerY})`}>
    {cue.items.map((item, index) => {
      return <g key={item.word.id}>
        <text {...glyph(item)} fill={`url(#${uid}-aura-fill)`}
          filter={`url(#${uid}-aura-${index})`}>{item.text}</text>
        {sheenOpacity > 0 && <text {...glyph(item)} fill="#fffef0" opacity={sheenOpacity}
          mask={`url(#${uid}-aura-sheen-mask)`}>{item.text}</text>}
      </g>;
    })}
    </g>
  </>;
};

/** Render native whole-word text so connected handwriting and font kerning stay intact. */
export const Expressive: React.FC<ClucapScene> = (scene) => {
  if (scene.styleId === "scribble") return <Scribble {...scene} />;
  if (scene.styleId === "golden-aura") return <GoldenAura {...scene} />;
  if (scene.styleId === "sunday-script") return <SundayScript {...scene} />;
  return null;
};
