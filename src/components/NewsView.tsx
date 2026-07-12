"use client";

import { useCallback, useEffect, useState } from "react";

type Channel = {
  id: string;
  label: string;
  lang: string;
  voice: string;
  defaultCategories: string[];
  hasCreds: boolean;
};

type NewsStory = { title: string };
type NewsInfo = {
  slug: string;
  channelId: string;
  channelLabel: string;
  category: string;
  lang: string;
  createdAt: string;
  title: string;
  description: string;
  tags: string[];
  stories: NewsStory[];
  videoBytes: number;
  videoId?: string;
  uploadedAt?: string;
  privacy?: string;
  publishAt?: string;
};

type Privacy = "private" | "unlisted" | "public";

function fmtBytes(n: number): string {
  return n > 0 ? `${(n / 1e6).toFixed(1)} MB` : "";
}

/** datetime-local value ("2026-07-11T09:30") -> RFC3339 UTC, or undefined. */
function toPublishAt(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

export default function NewsView({ onToast }: { onToast: (msg: string) => void }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [channelId, setChannelId] = useState("");
  const [category, setCategory] = useState("");

  const [rendering, setRendering] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<NewsInfo[]>([]);
  const [current, setCurrent] = useState<NewsInfo | null>(null);

  const [privacy, setPrivacy] = useState<Privacy>("public");
  const [scheduleAt, setScheduleAt] = useState("");
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);

  const busy = rendering || uploading;
  const channel = channels.find((c) => c.id === channelId) ?? null;

  const refreshDrafts = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/news/drafts");
      const data = await res.json();
      if (res.ok) setDrafts(data.drafts ?? []);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/studio/news/config");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setChannels(data.channels ?? []);
        setCategories(data.categories ?? []);
        if (data.channels?.[0]) setChannelId(data.channels[0].id);
        if (data.channels?.[0]?.defaultCategories?.[0]) setCategory(data.channels[0].defaultCategories[0]);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    void refreshDrafts();
  }, [refreshDrafts]);

  const openDraft = (info: NewsInfo) => {
    setCurrent(info);
    setUploadUrl(info.videoId ? `https://youtu.be/${info.videoId}` : null);
    setError(null);
  };

  const generate = async () => {
    if (!channelId || !category) return;
    setError(null);
    setUploadUrl(null);
    setCurrent(null);
    setRendering(true);
    try {
      const res = await fetch("/api/studio/news/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, category, nStories: 3 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCurrent(data.info as NewsInfo);
      onToast(`Rendered 3-story short for ${category}`);
      void refreshDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRendering(false);
    }
  };

  const upload = async () => {
    if (!current) return;
    setError(null);
    setUploading(true);
    try {
      const publishAt = toPublishAt(scheduleAt);
      const res = await fetch("/api/studio/news/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: current.slug, channelId: current.channelId, privacy, publishAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUploadUrl(data.url);
      onToast(data.scheduled ? "Uploaded — scheduled to publish" : `Uploaded to ${current.channelLabel} (${data.privacy})`);
      void refreshDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const catOptions = categories.length ? categories : channel?.defaultCategories ?? [];

  return (
    <div className="bod">
      <div className={`rail${busy ? " locked" : ""}`}>
        {busy ? <div className="lock-note">Working — one operation at a time.</div> : null}

        <section className="step">
          <div className="step-head">
            <span className="snum done">1</span>
            <span className="slab">Channel</span>
            <span className="smut push">edit content/channels.json to add more</span>
          </div>
          <div className="seg" role="tablist" aria-label="News channel">
            {channels.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={channelId === c.id}
                disabled={busy}
                onClick={() => {
                  setChannelId(c.id);
                  if (c.defaultCategories[0]) setCategory(c.defaultCategories[0]);
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
          {channel && !channel.hasCreds ? (
            <div className="note" style={{ marginTop: 8 }}>
              ⚠ No YouTube credentials for this channel — you can render, but upload needs its secrets in .env.local.
            </div>
          ) : null}
        </section>

        <section className="step">
          <div className="step-head">
            <span className="snum done">2</span>
            <span className="slab">Category</span>
          </div>
          <select
            className="sel"
            value={category}
            disabled={busy}
            aria-label="News category"
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="" disabled>Category…</option>
            {catOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </section>

        <section className="step">
          <div className="step-head">
            <span className="snum">3</span>
            <span className="slab">Generate</span>
          </div>
          <button
            className="btn btn-primary"
            disabled={busy || !channelId || !category}
            onClick={() => void generate()}
          >
            {rendering ? "Rendering… (~1 min)" : "Generate 3-story short"}
          </button>
          <div className="smut" style={{ marginTop: 8 }}>
            Pulls today&apos;s top {category || "…"} stories and renders the same branded Short as the daily action.
          </div>
        </section>

        {drafts.length ? (
          <section className="step">
            <div className="step-head">
              <span className="slab">Recent</span>
            </div>
            <div className="topic-list">
              {drafts.slice(0, 12).map((d) => (
                <button
                  key={d.slug}
                  className="tcard"
                  aria-pressed={current?.slug === d.slug}
                  onClick={() => openDraft(d)}
                  disabled={busy}
                >
                  <span className="tt">
                    {d.category} · {d.channelLabel}
                  </span>
                  <span className="ta">
                    {new Date(d.createdAt).toLocaleString()} {d.videoId ? "· uploaded" : ""}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <div className="stage">
        {error ? <div className="err" role="alert">{error}</div> : null}

        {!current ? (
          <div className="empty">
            <p>Pick a channel and category, then <strong>Generate a 3-story short</strong>.</p>
            <p className="smut">Each video = intro + 3 news stories + outro, voiced and rendered exactly like the GitHub Action, then uploaded to the channel you choose.</p>
          </div>
        ) : (
          <div className="detail">
            <div className="stage-frame vertical">
              <video
                key={current.slug}
                src={`/api/studio/news/file?slug=${encodeURIComponent(current.slug)}`}
                controls
                playsInline
              />
            </div>

            <h3 className="news-title">{current.title}</h3>
            <div className="smut">
              {current.channelLabel} · {current.category} · {fmtBytes(current.videoBytes)}
            </div>

            {current.stories.length ? (
              <ol className="news-stories">
                {current.stories.map((s, i) => (
                  <li key={i}>{s.title}</li>
                ))}
              </ol>
            ) : null}

            <div className="detail-actions-col">
              <div className="row" style={{ alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label className="smut">Privacy</label>
                <select
                  className="sel sel-inline"
                  value={privacy}
                  disabled={busy || Boolean(scheduleAt)}
                  onChange={(e) => setPrivacy(e.target.value as Privacy)}
                  aria-label="Upload privacy"
                >
                  <option value="public">public</option>
                  <option value="unlisted">unlisted</option>
                  <option value="private">private</option>
                </select>
                <label className="smut">Schedule at</label>
                <input
                  className="sel sel-inline"
                  type="datetime-local"
                  value={scheduleAt}
                  disabled={busy}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  aria-label="Schedule publish time"
                />
                {scheduleAt ? (
                  <button className="btn btn-sm" disabled={busy} onClick={() => setScheduleAt("")}>
                    clear
                  </button>
                ) : null}
              </div>
              {scheduleAt ? (
                <div className="smut">Scheduled uploads go up private, then auto-publish at the set time.</div>
              ) : null}

              <button
                className="btn btn-primary"
                disabled={busy || Boolean(current.videoId)}
                onClick={() => void upload()}
              >
                {uploading
                  ? "Uploading…"
                  : current.videoId
                    ? "Already uploaded"
                    : `Upload to ${current.channelLabel}`}
              </button>

              {uploadUrl ? (
                <div className="okb">
                  <strong>Uploaded.</strong>{" "}
                  <a href={uploadUrl} target="_blank" rel="noreferrer">{uploadUrl.replace("https://", "")}</a>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
