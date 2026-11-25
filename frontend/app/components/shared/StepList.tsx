import type { Step } from "../../lib/types";
import { Icon } from "./Icon";

// The stages of a long task in a row: waiting, running (with a live timer), done (with its time) or failed.
export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="steps" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((step, index) => (
        <li key={step.key} className={step.state}>
          <span className="step-dot">
            {step.state === "done" ? <Icon name="check" size={12} /> : step.state === "running" ? <span className="spinner tiny" /> : index + 1}
          </span>
          <span className="step-text">
            <span className="step-label">{step.label}</span>
            <span className="step-time">
              {step.state === "waiting" ? "waiting" : step.state === "failed" ? "failed" : `${(step.seconds ?? 0).toFixed(1)}s`}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
