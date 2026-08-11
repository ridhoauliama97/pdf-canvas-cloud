import { useCallback, useRef, useState } from "react";

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

interface UseEditorHistoryReturn<T> {
  state: T;
  setState: (updater: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clear: () => void;
}

/**
 * Undo/redo state management hook for editor elements.
 *
 * Maintains a bounded history stack so edits can be reverted
 * and re-applied without memory bloat.
 */
export function useEditorHistory<T>(initialState: T, maxHistory = 50): UseEditorHistoryReturn<T> {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  // Track initial state to avoid stale closures
  const initialStateRef = useRef(initialState);
  initialStateRef.current = initialState;

  const setState = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setHistory((prev) => {
        const nextPresent =
          typeof updater === "function" ? (updater as (p: T) => T)(prev.present) : updater;

        // Skip if nothing changed (shallow reference check is fine for arrays/objects)
        if (nextPresent === prev.present) return prev;

        const past = [...prev.past, prev.present];
        // Trim oldest entries when exceeding maxHistory
        if (past.length > maxHistory) {
          past.splice(0, past.length - maxHistory);
        }

        return {
          past,
          present: nextPresent,
          future: [], // new branch clears redo stack
        };
      });
    },
    [maxHistory],
  );

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;
      const past = [...prev.past];
      const previous = past.pop()!;
      return {
        past,
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;
      const future = [...prev.future];
      const next = future.shift()!;
      return {
        past: [...prev.past, prev.present],
        present: next,
        future,
      };
    });
  }, []);

  const clear = useCallback(() => {
    setHistory((prev) => ({
      past: [],
      present: prev.present,
      future: [],
    }));
  }, []);

  return {
    state: history.present,
    setState,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    clear,
  };
}
