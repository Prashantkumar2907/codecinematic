"use client";

/**
 * The Library tab, lifted verbatim out of `app/page.tsx`. It owns no state of
 * its own — everything arrives as props — so it is a pure view over the draft
 * list plus the upload/delete actions the parent's state machine drives.
 */
import type { ReactNode } from "react";
import { fileUrl } from "./studio-format";
import type { DraftInfo, Stage, View } from "./studio-types";

type Props = {
  drafts: DraftInfo[];
  selectedSlug: string | null;
  selectedDraft: DraftInfo | null;
  setSelectedSlug: (slug: string) => void;
  setView: (view: View) => void;
  stageError: string | null;
  copied: string | null;
  copyText: (key: string, text: string) => void;
  privacySelect: ReactNode;
  upload: (slug: string) => Promise<void> | void;
  busy: boolean;
  stage: Stage;
  uploadChannels: Record<string, string>;
  uploadUrl: string | null;
  setConfirmDelete: (draft: DraftInfo) => void;
};

export default function LibraryView({
  drafts,
  selectedSlug,
  selectedDraft,
  setSelectedSlug,
  setView,
  stageError,
  copied,
  copyText,
  privacySelect,
  upload,
  busy,
  stage,
  uploadChannels,
  uploadUrl,
  setConfirmDelete,
}: Props) {
  return (
      <div className="bod library">
        <div className="lib-list">
          {drafts.length === 0 ? (
            <div className="empty">
              <span>No videos yet</span>
              <button className="btn btn-primary btn-sm" onClick={() => setView("create")}>
                Go to Create
              </button>
            </div>
          ) : (
            drafts.map((d) => (
              <button key={d.slug} className="lrow" aria-pressed={selectedSlug === d.slug} onClick={() => setSelectedSlug(d.slug)}>
                {d.hasThumbnail ? (
                  <img className="lthumb" src={fileUrl(d.slug, "thumbnail.png")} alt="" loading="lazy" />
                ) : (
                  <span className="lthumb lthumb-fallback">{d.format}</span>
                )}
                <span className="lbody">
                  <span className="tt">{d.title}</span>
                  <span className="lmeta">
                    <span className="pill">{d.format}</span>
                    {d.subject ? <span className="pill">{d.subject}</span> : null}
                    <span className="smut">{(d.videoBytes / 1e6).toFixed(1)} MB</span>
                    {d.videoId ? (
                      <>
                        <span className="dot" aria-hidden />
                        <span className="smut">uploaded</span>
                      </>
                    ) : null}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>

        <div className="detail">
          {stageError ? (
            <div className="err" role="alert">
              {stageError}
            </div>
          ) : null}
          {selectedDraft ? (
            <>
              {selectedDraft.hasVideo ? (
                <video key={selectedDraft.slug} src={fileUrl(selectedDraft.slug, "video.webm")} controls />
              ) : null}

              <div className="row detail-copy-row">
                <div className="copy-field grow">
                  <div className="cf-head">
                    <span className="cf-label">Title</span>
                    <button className={`btn btn-sm${copied === "title" ? " copied" : ""}`} onClick={() => copyText("title", selectedDraft.title)}>
                      {copied === "title" ? "✓ Copied" : "⧉ Copy"}
                    </button>
                  </div>
                  <div className="cf-value">{selectedDraft.title}</div>
                </div>
                <div className="copy-field tags">
                  <div className="cf-head">
                    <span className="cf-label">Tags</span>
                    <button className={`btn btn-sm${copied === "tags" ? " copied" : ""}`} onClick={() => copyText("tags", selectedDraft.tags.join(", "))}>
                      {copied === "tags" ? "✓ Copied" : "⧉ Copy"}
                    </button>
                  </div>
                  <div className="cf-value">{selectedDraft.tags.join(", ")}</div>
                </div>
              </div>

              <div className="copy-field">
                <div className="cf-head">
                  <span className="cf-label">Description</span>
                  <button
                    className={`btn btn-sm${copied === "desc" ? " copied" : ""}`}
                    onClick={() => copyText("desc", `${selectedDraft.description}\n\n${selectedDraft.hashtags.join(" ")}`)}
                  >
                    {copied === "desc" ? "✓ Copied" : "⧉ Copy with hashtags"}
                  </button>
                </div>
                <div className="cf-value">{selectedDraft.description}</div>
              </div>

              <div className="detail-actions">
                {selectedDraft.hasThumbnail ? (
                  <img className="thumb-preview" src={fileUrl(selectedDraft.slug, "thumbnail.png")} alt="thumbnail" />
                ) : null}
                <div className="detail-actions-col">
                  <div className="row">
                    {selectedDraft.hasVideo ? (
                      <a className="btn btn-sm" href={fileUrl(selectedDraft.slug, "video.webm")} download={`${selectedDraft.slug}.webm`}>
                        ⬇ Download video (.webm)
                      </a>
                    ) : null}
                    {selectedDraft.hasThumbnail ? (
                      <a className="btn btn-sm" href={fileUrl(selectedDraft.slug, "thumbnail.png")} download={`${selectedDraft.slug}.png`}>
                        ⬇ Download thumbnail (.png)
                      </a>
                    ) : null}
                    {selectedDraft.hasCaptions ? (
                      <a className="btn btn-sm" href={fileUrl(selectedDraft.slug, "captions.srt")} download={`${selectedDraft.slug}.srt`}>
                        ⬇ Download captions (.srt)
                      </a>
                    ) : null}
                    {privacySelect}
                    <button
                      className="btn btn-sm"
                      onClick={() => void upload(selectedDraft.slug)}
                      disabled={busy || !!selectedDraft.videoId}
                    >
                      {stage === "uploading" ? <span className="spinner" aria-hidden /> : null}
                      {stage === "uploading" ? "Uploading…" : selectedDraft.videoId ? "Already uploaded" : "Upload to YouTube"}
                    </button>
                    {uploadChannels[selectedDraft.subject] ? (
                      <span className="smut">→ {uploadChannels[selectedDraft.subject]}</span>
                    ) : null}
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(selectedDraft)} disabled={busy}>
                      Delete
                    </button>
                  </div>
                  {selectedDraft.videoId ? (
                    <div className="okb">
                      On YouTube —{" "}
                      <a href={`https://youtu.be/${selectedDraft.videoId}`} target="_blank" rel="noreferrer">
                        youtu.be/{selectedDraft.videoId}
                      </a>{" "}
                      · review in Studio, then publish
                    </div>
                  ) : uploadUrl && stage === "uploaded" ? (
                    <div className="okb">
                      <strong>Uploaded.</strong>{" "}
                      <a href={uploadUrl} target="_blank" rel="noreferrer">
                        {uploadUrl.replace("https://", "")}
                      </a>{" "}
                      — review in YouTube Studio, then publish.
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="empty">Select a video on the left to see details, downloads and upload options.</div>
          )}
        </div>
      </div>
  );
}
