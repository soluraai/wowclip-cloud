"use client";

import { useState } from "react";

import { formatTime } from "../../lib/time";
import type { HistoryRender } from "../../lib/types";
import { Icon } from "../shared/Icon";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// One reel from the history: play it, download it, or open the file in the S3 console.
export function HistoryCard({ render, bucket }: { render: HistoryRender; bucket: string }) {
  const [copied, setCopied] = useState(false);

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(`s3://${bucket}/${render.reelKey}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="history-card">
      <video className="history-video" src={render.watchUrl} poster={render.coverUrl || undefined} controls preload="none" playsInline />

      <div className="history-info">
        <p className="history-date">{formatDate(render.createdAt)}</p>
        <h3>{render.clipTitle}</h3>
        <p className="history-source" title={render.videoTitle}>
          {render.channel} · {render.videoTitle}
        </p>

        <dl className="history-facts">
          <div><dt>Style</dt><dd>{render.styleName}</dd></div>
          <div><dt>Length</dt><dd>{formatTime(render.duration)}{render.sizeMb !== null ? ` · ${render.sizeMb} MB` : ""}</dd></div>
          <div><dt>Render</dt><dd>{render.lambdas} Lambdas · {render.renderSeconds.toFixed(1)}s</dd></div>
        </dl>

        <div className="history-actions">
          <a className="cta small" href={render.downloadUrl} download={render.fileName}>
            <Icon name="download" size={14} /> Download
          </a>
          <a className="ghost-button small" href={render.consoleUrl} target="_blank" rel="noreferrer" title="Open this file in the S3 console">
            <Icon name="external" size={13} /> S3
          </a>
          <button type="button" className="ghost-button small" onClick={copyKey} title={`s3://${bucket}/${render.reelKey}`}>
            <Icon name={copied ? "check" : "copy"} size={13} /> {copied ? "Copied" : "Key"}
          </button>
        </div>
      </div>
    </article>
  );
}
