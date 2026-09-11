import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import "./Modal.css";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  // "lg" is for content that needs real space to be usable (a document
  // preview) rather than a form — see FileViewerModal.tsx, the only "lg"
  // consumer so far.
  size?: "md" | "lg";
}

export default function Modal({ title, onClose, children, size = "md" }: ModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Portaled to document.body rather than rendered inline wherever the
  // caller happens to mount it (sometimes deep inside a data-table row, e.g.
  // SchoolYearTermPage.tsx's per-term "Edit LOA Results" modal) -- without
  // this, a real, reproducible Chromium compositor bug lets the sidebar
  // (position: sticky) visually paint over parts of a wide ("lg") modal even
  // though document.elementFromPoint confirms the modal is correctly on top
  // for hit-testing/interaction. Confirmed live via Playwright: the visual
  // bleed-through survived a forced scroll-triggered recomposite, so it's a
  // genuine paint-layer ordering bug, not a one-off screenshot timing
  // artifact. A portal sidesteps the whole class of stacking-context
  // ambiguity by rendering outside the sidebar's ancestor chain entirely,
  // rather than fighting it with ever-higher z-index values.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-card${size === "lg" ? " modal-card--lg" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-card__header">
          <h2 className="heading modal-card__title">{title}</h2>
          <button type="button" className="modal-card__close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-card__body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
