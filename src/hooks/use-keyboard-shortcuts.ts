import { useEffect } from "react";
import type { CanvasElement } from "@/types/template";

interface UseKeyboardShortcutsOptions {
  /** Currently selected element */
  selected: CanvasElement | null;
  /** Replace elements array (for undo-compatible updates) */
  setElements: React.Dispatch<React.SetStateAction<CanvasElement[]>>;
  /** Set selected element id */
  setSelectedId: (id: string | null) => void;
  /** Undo function from useEditorHistory */
  undo: () => void;
  /** Redo function from useEditorHistory */
  redo: () => void;
  /** Mark editor as dirty */
  setDirty: (dirty: boolean) => void;
}

/**
 * Global keyboard shortcuts for the editor.
 *
 * Ctrl+Z          → undo
 * Ctrl+Shift+Z    → redo
 * Ctrl+Y          → redo
 * Delete/Backspace → delete selected element
 * Arrow keys      → nudge by 1px (10px with Shift)
 * Escape          → deselect
 */
export function useKeyboardShortcuts({
  selected,
  setElements,
  setSelectedId,
  undo,
  redo,
  setDirty,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when typing inside form controls
      const target = event.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isEditable =
        target.isContentEditable ||
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select";

      const isMod = event.ctrlKey || event.metaKey;

      // Undo: Ctrl+Z
      if (isMod && !event.shiftKey && event.key === "z") {
        event.preventDefault();
        undo();
        return;
      }

      // Redo: Ctrl+Shift+Z or Ctrl+Y
      if ((isMod && event.shiftKey && event.key === "z") || (isMod && event.key === "y")) {
        event.preventDefault();
        redo();
        return;
      }

      // Skip remaining shortcuts when inside editable fields
      if (isEditable) return;

      // Delete selected element
      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selected) return;
        event.preventDefault();
        setElements((prev) => prev.filter((el) => el.id !== selected.id));
        setSelectedId(null);
        setDirty(true);
        return;
      }

      // Arrow keys nudge
      if (event.key.startsWith("Arrow")) {
        if (!selected) return;
        // Don't intercept if user is in a numeric input
        if (tagName === "input" && (target as HTMLInputElement).type === "number") return;

        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const delta: Record<string, Partial<CanvasElement>> = {
          ArrowUp: { y: -step },
          ArrowDown: { y: step },
          ArrowLeft: { x: -step },
          ArrowRight: { x: step },
        };
        const patch = delta[event.key];
        if (!patch) return;

        setElements((prev) =>
          prev.map((el) => {
            if (el.id !== selected.id || el.locked) return el;
            return {
              ...el,
              ...(patch.x !== undefined ? { x: el.x + patch.x } : {}),
              ...(patch.y !== undefined ? { y: el.y + patch.y } : {}),
            };
          }),
        );
        setDirty(true);
        return;
      }

      // Escape → deselect
      if (event.key === "Escape") {
        setSelectedId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected, setElements, setSelectedId, undo, redo, setDirty]);
}
