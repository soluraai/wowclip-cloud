"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "./Icon";

type Item = { value: string; label: string };

type Props = {
  label: string;
  items: Item[];
  value: string;
  fallbackLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function Dropdown({ label, items, value, fallbackLabel, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const selected = items.find((item) => item.value === value);

  // Close the list when the user clicks outside it or presses Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(event: MouseEvent) {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="dropdown" ref={box}>
      <button
        type="button"
        className="dropdown-button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <span>{selected ? selected.label : fallbackLabel}</span>
        <Icon name="chevron" size={14} />
      </button>

      {open && (
        <ul className="dropdown-list" role="listbox" aria-label={label}>
          {items.map((item) => (
            <li key={item.value}>
              <button
                type="button"
                role="option"
                aria-selected={item.value === value}
                className={item.value === value ? "selected" : ""}
                onClick={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
              >
                {item.label}
                {item.value === value && <Icon name="check" size={14} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
