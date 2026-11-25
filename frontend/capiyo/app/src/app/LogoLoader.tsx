import s from "./LogoLoader.module.css";

/**
 * Capiyo's loading mark: the logo, dim, with a band of light sweeping through it and a thin arc circling it.
 * Used everywhere something loads, centered, instead of grey placeholder boxes.
 */
export default function LogoLoader({ size = 40, label, fill = false }: {
  size?: number;
  /** Short line under the mark; left out for small spots. */
  label?: string;
  /** Fill the parent and center the mark in it. */
  fill?: boolean;
}) {
  const mark = (
    <span className={s.mark} style={{ width: size, height: size }} aria-hidden="true">
      <i className={s.orbit} />
      <i className={s.logo} />
      <i className={s.shine} />
    </span>
  );
  return (
    <span className={`${s.loader} ${fill ? s.fill : ""}`} role="status" aria-label={label ?? "Loading"}>
      {mark}
      {label && <span className={s.label}>{label}</span>}
    </span>
  );
}
