// Turns a 0–100 virality score into a colour level and a one-word label.
export function scoreLevel(score: number) {
  if (score >= 80) return { name: "high", label: "Strong" };
  if (score >= 60) return { name: "mid", label: "Good" };
  return { name: "low", label: "Fair" };
}
