import { formatTime } from "../../lib/time";
import type { VideoInfo } from "../../lib/types";
import { Icon } from "../shared/Icon";

type Props = { video: VideoInfo; onChange: () => void; hero?: boolean };

// The YouTube video the clips come from. On the setup screen it is a big hero: the thumbnail fills the width,
// its bottom melts into a blur and the page color, and the title sits on top of that fade.
export function VideoCard({ video, onChange, hero = false }: Props) {
  if (hero) {
    return (
      <section className="video-hero" style={{ "--thumb": `url(${video.thumbnail})` } as React.CSSProperties}>
        <div className="video-hero-glow" aria-hidden="true" />
        <div className="video-hero-image" aria-hidden="true" />
        <div className="video-hero-blur" aria-hidden="true" />
        <div className="video-hero-shade" aria-hidden="true" />
        <button type="button" className="video-hero-change" onClick={onChange}>
          <Icon name="back" size={13} /> Use a different link
        </button>
        <div className="video-hero-text">
          <p className="video-hero-channel">{video.channel}</p>
          <h2>{video.title}</h2>
          <p className="video-hero-meta">
            <span><Icon name="clock" size={13} /> {formatTime(video.durationSeconds)}</span>
            <span>YouTube video</span>
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="video-card">
      <div className="video-thumb" style={{ backgroundImage: `url(${video.thumbnail})` }}>
        <span className="time-badge">{formatTime(video.durationSeconds)}</span>
      </div>
      <div className="video-meta">
        <p className="eyebrow">{video.channel}</p>
        <h2>{video.title}</h2>
        <button type="button" className="ghost-button small" onClick={onChange}>
          <Icon name="back" size={14} /> Use a different link
        </button>
      </div>
    </section>
  );
}
