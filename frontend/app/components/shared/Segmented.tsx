"use client";

import { useLayoutEffect, useRef, useState } from "react";

type Item = { value: string; label: string };
type Mark = { left: number; top: number; width: number; height: number };

type Props = {
  items: Item[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

// A row of choices where the highlight slides from the old choice to the new one.
// The highlight is one box drawn behind the buttons; it is moved to wherever the chosen button is.
export function Segmented({ items, value, onChange, className = "" }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [mark, setMark] = useState<Mark | null>(null);

  useLayoutEffect(() => {
    const holder = box.current;
    if (!holder) return;
    function measure() {
      const chosen = holder?.querySelector<HTMLButtonElement>("button.active");
      setMark(chosen ? { left: chosen.offsetLeft, top: chosen.offsetTop, width: chosen.offsetWidth, height: chosen.offsetHeight } : null);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(holder);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div className={`segmented ${className}`} ref={box} role="radiogroup">
      {mark && (
        <span
          className="segmented-mark"
          aria-hidden="true"
          style={{ transform: `translate(${mark.left}px, ${mark.top}px)`, width: mark.width, height: mark.height }}
        />
      )}
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="radio"
          aria-checked={value === item.value}
          className={value === item.value ? "active" : ""}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
