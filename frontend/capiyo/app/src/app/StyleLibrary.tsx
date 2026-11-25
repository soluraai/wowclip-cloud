"use client";

import { memo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { CAPTION_STYLES, captionStyle, type CaptionStyleId } from "./styleCatalog";
import s from "./StyleLibrary.module.css";

export { CAPTION_STYLES } from "./styleCatalog";
/** Styles taken out of the library; projects already using one still open and render. */
const RETIRED = new Set<string>(["lyric-focus"]);
const TIERS = ["Basic", "Standard", "Premium"] as const;
const TIER_LABEL: Record<(typeof TIERS)[number], string> = { Basic: "Basic", Standard: "Standard", Premium: "Premium" };
type Tier = (typeof TIERS)[number];

const motionQuery = () =>
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
const subscribeMotion = (update: () => void) => {
  const query = motionQuery();
  query?.addEventListener("change", update);
  return () => query?.removeEventListener("change", update);
};

import { StyleCardSkeleton } from "./Skeleton";

// Preload dynamic preview chunk in browser
if (typeof window !== "undefined") {
  import("./CaptionStylePreview");
}

const CaptionStylePreview = dynamic(() => import("./CaptionStylePreview"), {
  ssr: false,
  loading: () => <StyleCardSkeleton />,
});

type Props = {
  selectedId: string;
  onSelect: (id: CaptionStyleId) => void;
};

// Load a tier on its first visit, then retain it for instant return visits.
function StyleLibrary({ selectedId, onSelect }: Props) {
  const [activeTier, setActiveTier] = useState<Tier>(() => (captionStyle(selectedId)?.category as Tier) ?? "Basic");
  const [visitedTiers, setVisitedTiers] = useState<Set<Tier>>(() => new Set<Tier>([(captionStyle(selectedId)?.category as Tier) ?? "Basic"]));
  const tier = activeTier;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => motionQuery()?.matches ?? false, () => false);
  const listRef = useRef<HTMLDivElement>(null);
  const previewingId = reducedMotion ? null : hoveredId;
  const setTier = (next: Tier) => {
    setVisitedTiers(current => current.has(next) ? current : new Set([...current, next]));
    setActiveTier(next);
    setHoveredId(null);
    listRef.current?.scrollTo({ top: 0 });
  };

  return (
    <aside className={s.library} aria-label="Caption styles">
      <div className={s.tabsHeader}>
        <div className={s.tabsGroup} role="tablist" aria-label="Caption style tier">
          <span className={s.tabIndicator} style={{ translate: `${TIERS.indexOf(tier) * 100}% 0` }} aria-hidden="true" />
          {TIERS.map((item) => <button key={item} id={`caption-tier-${item}`} type="button" role="tab"
            aria-selected={tier === item} aria-controls="caption-style-panel"
            tabIndex={tier === item ? 0 : -1}
            className={`${s.tabButton} ${tier === item ? s.tabActive : ""}`}
            onClick={() => setTier(item)}
            onKeyDown={(event) => {
              const index = TIERS.indexOf(item);
              const next = event.key === "ArrowRight" ? (index + 1) % TIERS.length
                : event.key === "ArrowLeft" ? (index + TIERS.length - 1) % TIERS.length
                  : event.key === "Home" ? 0 : event.key === "End" ? TIERS.length - 1 : -1;
              if (next < 0) return;
              event.preventDefault();
              setTier(TIERS[next]);
              document.getElementById(`caption-tier-${TIERS[next]}`)?.focus();
            }}
          >{TIER_LABEL[item]}</button>)}
        </div>
      </div>

      {/* Visited tiers stay ready; unopened tiers do not load their engines. */}
      <div className={s.list} id="caption-style-panel" data-style-scroll ref={listRef} role="tabpanel" aria-labelledby={`caption-tier-${tier}`}>
        {TIERS.map((section) => {
          if (!visitedTiers.has(section)) return null;
          const items = CAPTION_STYLES.filter(style => style.category === section && !RETIRED.has(style.id));
          if (!items.length) {
            return (
              <div key={section} className={`${s.tier} ${tier === section ? "" : s.tierHidden}`}>
                <div className={s.emptyState}>
                  <span>{section} styles</span>
                  <p>More styles will be added here later.</p>
                </div>
              </div>
            );
          }
          return (
            <div key={section} className={`${s.tier} ${tier === section ? "" : s.tierHidden}`} data-tier={section}>
              {items.map((item) => {
                const isSelected = selectedId === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`${s.card} ${isSelected ? s.selected : ""}`}
                    aria-pressed={isSelected}
                    aria-hidden={tier !== section}
                    tabIndex={tier === section ? undefined : -1}
                    aria-label={`Select ${item.name}. ${item.description}`}
                    onClick={() => onSelect(item.id)}
                    onPointerEnter={(event) => {
                      if (event.pointerType !== "touch") setHoveredId(item.id);
                    }}
                    onPointerLeave={() => setHoveredId(null)}
                  >
                    <div className={s.preview}>
                      <CaptionStylePreview style={item} playing={previewingId === item.id} reducedMotion={reducedMotion} />
                    </div>
                    <span className={s.cardName}>{item.name}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

export default memo(StyleLibrary);
