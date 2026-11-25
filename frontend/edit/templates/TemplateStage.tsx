import React from "react";
import { AbsoluteFill } from "remotion";

import type { EditMedia, EditTemplate } from "../types";
import { AestheticNewsLayout } from "./INFOGRPAHY/AestheticNews/AestheticNewsLayout";
import { ElonRocketNews } from "./INFOGRPAHY/ElonRocketNews/Main";
import { ChecklistView } from "./component/ChecklistView/ChecklistView";
import { ComparisonView } from "./component/ComparisonView/ComparisonView";
import { ShowcaseCard } from "./component/ShowcaseCard/ShowcaseCard";
import { TimelineView } from "./component/TimelineView/TimelineView";
import { TvText } from "./tvtext/TvText";

// The library templates (copied from the Remotion project) filled from the director's short JSON. The director only
// writes words; every size, colour and timing below is fixed here, scaled to the length of the slot.

const NAVY = "linear-gradient(180deg, #0b1020 0%, #111a2e 55%, #0b1020 100%)";
const BLUE = "#3B82F6";

const still = (media?: EditMedia) => (!media ? "" : media.kind === "video" ? media.poster || "" : media.src);

const spread = (frames: number, count: number, share: number, most: number) =>
  Math.max(4, Math.min(most, Math.floor((frames * share) / Math.max(1, count))));

type Props = { template: EditTemplate; media?: EditMedia; frames: number; accent: string };

export const TemplateStage: React.FC<Props> = ({ template, media, frames, accent }) => {
  const seconds = frames / 30;
  const t = template;

  if (t.name === "news") {
    return (
      <AestheticNewsLayout
        config={{
          durationInSeconds: seconds,
          kicker: t.topic || "NEWS",
          headline: t.headline || "",
          description: t.description || "",
          author: t.source ? `By ${t.source}` : "",
          dateStr: t.date || "",
          bgImageUrl: still(media),
          accentColor: accent,
          logoUrl: "",
          highlights: [],
        }}
      />
    );
  }

  if (t.name === "person") {
    const photo = still(media);
    return (
      <ElonRocketNews
        config={{
          publisher: t.source || "",
          topic: t.topic || "",
          dateStr: t.date || "",
          headline: t.headline || "",
          description: t.description || "",
          upfrontImage: photo,
          backgroundImage: photo,
          durationInFrames: frames,
          timing: { newsAppearFrame: Math.round(Math.min(45, frames * 0.3)), photoShrinkDuration: 18, initialPhotoHeight: 62, targetPhotoHeight: 44 },
          script: { instructions: [] },
        }}
      />
    );
  }

  if (t.name === "timeline") {
    const stops = t.milestones || [];
    return (
      <TimelineView
        config={{
          theme: { backgroundGradient: NAVY, nodeColor: BLUE, activeNodeColor: accent, activeNodeGlow: `${accent}55` },
          title: { text: t.title || "", subtitle: t.subtitle || "" },
          milestones: stops.map((stop, index) => ({ ...stop, isActive: index === (t.active ?? stops.length - 1) })),
          animation: { spineDrawFrames: 20, nodeEntranceDelay: 8, nodeStaggerFrames: spread(frames, stops.length, 0.5, 24) },
        }}
      />
    );
  }

  if (t.name === "versus") {
    const rows = t.rows || [];
    return (
      <ComparisonView
        config={{
          theme: { backgroundGradient: NAVY, vsColor: accent, vsBg: `${accent}26`, vsBorderColor: `${accent}55` },
          title: { text: t.title || "" },
          left: { name: t.left || "", color: BLUE },
          right: { name: t.right || "", color: accent },
          rows: rows.map((row) => ({
            label: row.label,
            leftValue: row.left,
            rightValue: row.right,
            winner: row.winner === "none" ? undefined : row.winner,
          })),
          animation: { columnEntranceFrames: 16, vsDelay: 8, rowStaggerFrames: spread(frames, rows.length, 0.45, 20) },
        }}
      />
    );
  }

  if (t.name === "checklist") {
    const items = t.items || [];
    return (
      <ChecklistView
        theme={{
          backgroundColor: "#0b1020",
          backgroundGradient: NAVY,
          staggerFrames: spread(frames, items.length, 0.55, 30),
          textFontSize: items.length > 3 ? 50 : 58,
        }}
        items={items.map((text, index) => ({
          marker: t.marker === "check" ? "check" : "number",
          value: index + 1,
          text,
          markerColor: accent,
          textColor: "#FFFFFF",
          animation: "slideUp",
          wordStaggerFrames: 3,
          checked: t.marker === "check",
        }))}
      />
    );
  }

  if (t.name === "showcase") {
    return (
      <ShowcaseCard
        config={{
          composition: { fps: 30, durationSeconds: seconds },
          background: {
            backgroundColor: "#0b1020",
            backgroundGradient: "radial-gradient(ellipse at 50% 35%, #1b2640 0%, #0d1424 55%, #070b14 100%)",
            showGrid: true,
            gridColor: "rgba(148, 163, 184, 0.05)",
            showOrbs: true,
            orb1Color: `${accent}22`,
            orb2Color: "rgba(59, 130, 246, 0.12)",
            orb3Color: "rgba(148, 163, 184, 0.08)",
          },
          image: { src: still(media), heightPercent: 0.55, objectFit: "contain", borderRadius: 24, showShadow: true, shadowColor: "rgba(0, 0, 0, 0.55)", entranceType: "springUp" },
          text: { value: t.text || "", color: "#FFFFFF", fontSize: 72, fontWeight: 800, entranceType: "fadeUp", entranceDelay: 8 },
        }}
      />
    );
  }

  if (t.name === "headline") {
    const words = (t.text || "").split(/\s+/).filter(Boolean);
    const step = spread(frames, words.length, 0.4, 9);
    const emphasis = (t.emphasis || "").toLowerCase();
    return (
      <TvText
        mediaSrc={media ? media.src : "#0B0E14"}
        objectFit="cover"
        segments={words.map((value, index) => ({
          type: "text" as const,
          value,
          startFrame: 6 + index * step,
          ...(emphasis && value.toLowerCase().replace(/[^a-z0-9']/g, "").startsWith(emphasis.split(" ")[0])
            ? { emphasis: "marker" as const, color: "#0B0E14", emphasisColor: accent }
            : {}),
        }))}
      />
    );
  }

  return <AbsoluteFill style={{ background: NAVY }} />;
};
