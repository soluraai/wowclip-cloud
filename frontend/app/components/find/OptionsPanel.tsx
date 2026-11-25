import {
  GENRES,
  LENGTH_PRESETS,
  MAX_SECONDS,
  MIN_TIMEFRAME_SECONDS,
  TOPICS,
  getOptionsError,
  type ClipOptions,
} from "../../lib/options";
import { formatTime, parseTime } from "../../lib/time";
import { Dropdown } from "../shared/Dropdown";
import { Segmented } from "../shared/Segmented";
import { RangeBar } from "./RangeBar";

type Props = {
  options: ClipOptions;
  videoSeconds: number;
  onChange: (options: ClipOptions) => void;
};

const TOPIC_ITEMS = [
  { value: "any", label: "Anything, let AI decide" },
  ...TOPICS.map((topic) => ({ value: topic.id, label: topic.label })),
];

export function OptionsPanel({ options, videoSeconds, onChange }: Props) {
  const error = getOptionsError(options, videoSeconds);

  // Which dropdown item matches the text box right now?
  const matchedTopic = TOPICS.find((topic) => topic.sentence === options.instruction);
  const topicValue = options.instruction.trim() === "" ? "any" : matchedTopic ? matchedTopic.id : "custom";

  function update(change: Partial<ClipOptions>) {
    onChange({ ...options, ...change });
  }

  function pickTopic(id: string) {
    const topic = TOPICS.find((t) => t.id === id);
    update({ instruction: topic ? topic.sentence : "" });
  }

  function choosePart() {
    update({
      timeframeMode: "part",
      fromTime: options.fromTime || "0:00",
      toTime: options.toTime || formatTime(videoSeconds),
    });
  }

  return (
    <div className="options-panel">
      <section className="option-section">
        <div className="option-head">
          <span className="option-number">01</span>
          <h3>Clip length</h3>
          <p>Auto picks the sweet spot for Reels and Shorts, usually 30 to 60 seconds.</p>
        </div>
        <div className="option-body">
        <Segmented
          className="length-grid"
          items={LENGTH_PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))}
          value={options.lengthId}
          onChange={(lengthId) => update({ lengthId: lengthId as ClipOptions["lengthId"] })}
        />

        {options.lengthId === "custom" && (
          <div className="custom-range">
            <label>
              <span>From</span>
              <input
                type="number"
                value={options.customMin}
                onChange={(event) => update({ customMin: Number(event.target.value) })}
              />
            </label>
            <label>
              <span>To</span>
              <input
                type="number"
                value={options.customMax}
                onChange={(event) => update({ customMax: Number(event.target.value) })}
              />
            </label>
            <span className="unit">seconds, up to {MAX_SECONDS}</span>
          </div>
        )}
        </div>
      </section>

      <section className="option-section">
        <div className="option-head">
          <span className="option-number">02</span>
          <h3>Which part of the video</h3>
          <p>Search the whole video, or only one part of it, for example the second half of a long podcast.</p>
        </div>
        <div className="option-body">
        <Segmented
          className="two-row"
          items={[{ value: "whole", label: "Whole video" }, { value: "part", label: "Only a part" }]}
          value={options.timeframeMode}
          onChange={(mode) => (mode === "part" ? choosePart() : update({ timeframeMode: "whole" }))}
        />

        {options.timeframeMode === "part" && (
          <RangeBar
            max={videoSeconds}
            start={Math.min(parseTime(options.fromTime) ?? 0, videoSeconds)}
            end={Math.min(parseTime(options.toTime) ?? videoSeconds, videoSeconds)}
            minGap={Math.min(MIN_TIMEFRAME_SECONDS, videoSeconds)}
            onChange={(start, end) => update({ fromTime: formatTime(start), toTime: formatTime(end) })}
          />
        )}

        {options.timeframeMode === "part" && (
          <div className="custom-range">
            <label>
              <span>From</span>
              <input
                type="text"
                placeholder="0:00"
                value={options.fromTime}
                onChange={(event) => update({ fromTime: event.target.value })}
              />
            </label>
            <label>
              <span>To</span>
              <input
                type="text"
                placeholder={formatTime(videoSeconds)}
                value={options.toTime}
                onChange={(event) => update({ toTime: event.target.value })}
              />
            </label>
            <span className="unit">video length {formatTime(videoSeconds)}</span>
          </div>
        )}
        </div>
      </section>

      <section className="option-section">
        <div className="option-head">
          <span className="option-number">03</span>
          <h3>Video type</h3>
          <p>Tells the AI what kind of video this is, so it judges the moments the right way.</p>
        </div>
        <div className="option-body">
        <Dropdown
          label="Video type"
          items={GENRES}
          value={options.genre}
          fallbackLabel="Let AI detect"
          onChange={(genre) => update({ genre })}
        />
        </div>
      </section>

      <section className="option-section">
        <div className="option-head">
          <span className="option-number">04</span>
          <h3>What should we find?</h3>
          <p>Pick a topic or write your own. If we can&apos;t find it, you get the best clips instead.</p>
        </div>
        <div className="option-body">
        <Dropdown
          label="Topic"
          items={TOPIC_ITEMS}
          value={topicValue}
          fallbackLabel="My own request"
          onChange={pickTopic}
        />
        <textarea
          aria-label="Describe what you want"
          rows={3}
          maxLength={500}
          placeholder="For example: the part where he talks about his first failure"
          value={options.instruction}
          onChange={(event) => update({ instruction: event.target.value })}
        />
        </div>
      </section>

      {error && <p className="form-error panel-error">{error}</p>}
    </div>
  );
}
