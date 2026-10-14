"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/** "Commentaire supprimé · Annuler", bottom of the screen; disappears after a few seconds. */
export function UndoToast({ message, onUndo, onDismiss }: { message: string; onUndo: () => void; onDismiss: () => void }) {
  // The timer starts once (a parent re-render must not push it back).
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss.current(), 6000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="undo-toast" role="status">
      <span>{message}</span>
      <button type="button" className="undo-toast-action" onClick={onUndo}>
        Annuler
      </button>
      <button type="button" className="undo-toast-close" onClick={onDismiss} aria-label="Fermer">
        <X />
      </button>
    </div>
  );
}
