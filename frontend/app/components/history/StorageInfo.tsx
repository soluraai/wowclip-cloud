"use client";

import { useState } from "react";

import type { History } from "../../lib/types";
import { Icon } from "../shared/Icon";

const FOLDERS = [
  { name: "clips/", about: "the 9:16 clips cut and cropped for reels" },
  { name: "reels/", about: "the finished reels rendered by AWS Lambda" },
  { name: "history/", about: "one record (.json) and one cover (.jpg) per reel: this page" },
];

// Where the reels live in Amazon S3, and two ways to open that place: the AWS console or the AWS CLI.
export function StorageInfo({ history }: { history: History }) {
  const [copied, setCopied] = useState(false);
  const command = `aws s3 ls s3://${history.bucket}/${history.folder} --recursive`;

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="storage" aria-label="S3 storage">
      <div className="storage-head">
        <div>
          <p className="eyebrow">Stored in Amazon S3</p>
          <p className="storage-path">
            s3://{history.bucket}/<strong>{history.folder}</strong>
          </p>
          <p className="storage-region">Region {history.region}</p>
        </div>
        <a className="ghost-button small" href={history.consoleUrl} target="_blank" rel="noreferrer">
          <Icon name="external" size={13} /> Open in AWS console
        </a>
      </div>

      <ul className="storage-folders">
        {FOLDERS.map((folder) => (
          <li key={folder.name}>
            <Icon name="folder" size={14} />
            <code>{folder.name}</code>
            <span>{folder.about}</span>
          </li>
        ))}
      </ul>

      <div className="storage-cli">
        <code>{command}</code>
        <button type="button" className="ghost-button small" onClick={copyCommand}>
          <Icon name={copied ? "check" : "copy"} size={13} /> {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <p className="storage-note">
        The list is read from S3 every time this page opens, so any laptop running wowclip with the same AWS keys
        (backend/api_keys.json) shows the same history.
      </p>
    </section>
  );
}
