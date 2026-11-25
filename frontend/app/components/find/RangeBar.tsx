import { formatTime } from "../../lib/time";

type Props = {
  max: number;
  start: number;
  end: number;
  minGap: number;
  onChange: (start: number, end: number) => void;
};

// A bar with two handles: the left one sets where the part starts, the right one where it ends.
// It is two normal range sliders stacked on top of each other, with a white fill between them.
export function RangeBar({ max, start, end, minGap, onChange }: Props) {
  const startPercent = (start / max) * 100;
  const endPercent = (end / max) * 100;

  return (
    <div className="range">
      <div className="range-bar">
        <div className="range-track">
          <div className="range-fill" style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }} />
        </div>
        <input
          type="range"
          aria-label="Start of the part"
          min={0}
          max={max}
          value={start}
          onChange={(event) => onChange(Math.min(Number(event.target.value), end - minGap), end)}
        />
        <input
          type="range"
          aria-label="End of the part"
          min={0}
          max={max}
          value={end}
          onChange={(event) => onChange(start, Math.max(Number(event.target.value), start + minGap))}
        />
      </div>
      <div className="range-labels">
        <span>0:00</span>
        <strong>
          {formatTime(start)} – {formatTime(end)}
        </strong>
        <span>{formatTime(max)}</span>
      </div>
    </div>
  );
}
