"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import "./history.css";

import { HistoryCard } from "../../components/history/HistoryCard";
import { StorageInfo } from "../../components/history/StorageInfo";
import { Icon } from "../../components/shared/Icon";
import { getHistory } from "../../lib/api";
import type { History } from "../../lib/types";

// Render history: every reel ever rendered, read from S3 (not from this browser), so it is the same on every laptop.
export default function HistoryPage() {
  const [history, setHistory] = useState<History | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHistory(await getHistory());
    } catch (loadFailed) {
      setError((loadFailed as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const count = history?.renders.length ?? 0;

  return (
    <main className="history-page">
      <header className="topbar">
        <Link className="ghost-button" href="/">
          <Icon name="back" size={14} /> wowclip
        </Link>
        <div className="topbar-video">
          <p className="topbar-title">Render history</p>
        </div>
        <button type="button" className="ghost-button" onClick={load} disabled={loading}>
          {loading ? <span className="spinner tiny" /> : <Icon name="replay" size={14} />} Refresh
        </button>
      </header>

      {error && <div className="message-box error" role="alert"><p>Could not read the history from S3: {error}</p></div>}

      {history && <StorageInfo history={history} />}

      {history && (
        <section className="results" aria-label="Rendered reels">
          <div className="results-heading">
            <h2>{count} {count === 1 ? "reel" : "reels"}</h2>
            <p className="results-hint">Newest first · links work for 6 hours, refresh for new ones</p>
          </div>
          {count === 0 ? (
            <p className="history-empty">No reels yet. Render one and it shows up here.</p>
          ) : (
            <div className="history-grid">
              {history.renders.map((render) => (
                <HistoryCard key={render.id} render={render} bucket={history.bucket} />
              ))}
            </div>
          )}
        </section>
      )}

      {!history && loading && (
        <p className="history-empty"><span className="spinner" /> Reading the history from S3…</p>
      )}
    </main>
  );
}
