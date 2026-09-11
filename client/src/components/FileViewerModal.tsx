import { useEffect, useState } from "react";
import Modal from "./Modal";
import { api } from "../api/client";
import { DownloadIcon } from "../icons/Icons";

interface FileViewerModalProps {
  submissionId: number;
  fileName?: string | null;
  onClose: () => void;
}

// Only PDF has a browser-native inline viewer. Every other type this app
// accepts (doc/docx/xls/xlsx -- see server/src/utils/fileTypes.ts's
// FILE_TYPE_OPTIONS) has no in-browser renderer at all: pointing an
// <iframe> at a blob: URL for one of those doesn't show an error, it just
// silently triggers Chromium's download machinery, which then blocks the
// download outright because it's an iframe navigation rather than a real
// user-initiated top-level one -- net::ERR_ABORTED, blank iframe forever,
// zero feedback.
//
// PDF itself isn't safe from this either. If the viewer's own browser has
// "Download PDF files instead of automatically opening them in Chrome"
// turned on (chrome://settings/content/pdfDocuments -- not this app's
// default, but a real per-user/per-org setting, plausible on a
// DepEd-managed machine), the iframe doesn't fail or error at all: Chrome
// swaps in its own internal placeholder page (a raw file-id heading and an
// unlabeled "Open" button) instead of the PDF, with zero JS-visible signal
// that anything went wrong -- confirmed live by reproducing that exact
// Chrome preference (`plugins.always_open_pdf_externally`) in a real,
// non-bundled Chrome profile. There is no reliable way to detect this from
// the parent page, so the fix isn't "detect and fall back" -- it's "never
// depend on the iframe alone in the first place."
function isInlinePreviewable(fileName: string | null | undefined): boolean {
  return (fileName ?? "").toLowerCase().endsWith(".pdf");
}

// Fetches and renders a submission's file inline as a "lg" Modal instead of
// a new tab. The blob URL is created and consumed inside this same
// component/document, so the Chromium restriction that blocked the earlier
// new-tab approach (navigating a *different* tab/window to a blob: URL
// created elsewhere — see the old FileViewerPage.tsx / CLAUDE.md's
// "Authenticated file viewing" section) never applies here in the first
// place.
export default function FileViewerModal({ submissionId, fileName, onClose }: FileViewerModalProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setError(null);
    api
      .get(`/submissions/${submissionId}/download`, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        objectUrl = window.URL.createObjectURL(res.data);
        setUrl(objectUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.data?.message ?? "Failed to load file.");
      });
    return () => {
      cancelled = true;
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [submissionId]);

  function handleDownloadInstead() {
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName ?? "download";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <Modal title={fileName ?? "File Preview"} onClose={onClose} size="lg">
      {error ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--status-red)", fontSize: 14 }}>{error}</div>
      ) : !url ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-secondary)", fontSize: 14 }}>
          Loading file...
        </div>
      ) : (
        <>
          {/* Always visible once the file is loaded, not just as a fallback for
              non-PDF types -- this is the one path guaranteed to work regardless
              of the viewer's own browser/PDF-handling settings (see the
              isInlinePreviewable comment above). */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "0 4px 12px",
              borderBottom: "1px solid var(--card-border)",
              marginBottom: 12,
            }}
          >
            <button type="button" className="btn btn--ghost" onClick={handleDownloadInstead}>
              <DownloadIcon /> Download file
            </button>
          </div>
          {isInlinePreviewable(fileName) ? (
            <iframe
              src={url}
              title={fileName ?? "File preview"}
              style={{ width: "100%", height: "72vh", border: "none", display: "block" }}
            />
          ) : (
            <div style={{ padding: "40px 60px 60px", textAlign: "center", color: "var(--text-secondary)", fontSize: 14 }}>
              Preview isn't available for this file type. Use the Download button above to open it in its own
              application.
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
