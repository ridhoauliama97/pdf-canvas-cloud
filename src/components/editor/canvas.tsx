import { useCallback, useRef, useState } from "react";
import { paginate } from "@/lib/layout-paginate";
import { ElementView } from "@/components/editor/element-view";
import type { CanvasElement, PageSetup } from "@/types/template";
import { cn } from "@/lib/utils";

type Handle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

const HANDLES: { key: Handle; className: string; cursor: string }[] = [
  { key: "nw", className: "-top-1 -left-1", cursor: "nwse-resize" },
  { key: "ne", className: "-top-1 -right-1", cursor: "nesw-resize" },
  { key: "sw", className: "-bottom-1 -left-1", cursor: "nesw-resize" },
  { key: "se", className: "-bottom-1 -right-1", cursor: "nwse-resize" },
  { key: "n", className: "-top-1 left-1/2 -translate-x-1/2", cursor: "ns-resize" },
  { key: "s", className: "-bottom-1 left-1/2 -translate-x-1/2", cursor: "ns-resize" },
  { key: "w", className: "top-1/2 -left-1 -translate-y-1/2", cursor: "ew-resize" },
  { key: "e", className: "top-1/2 -right-1 -translate-y-1/2", cursor: "ew-resize" },
];

const SNAP = 6;

interface Guide {
  axis: "x" | "y";
  at: number;
  page: number;
}

function snapValue(value: number, candidates: number[]): { value: number; hit?: number } {
  let best: { value: number; hit?: number } = { value };
  let bestDistance = SNAP;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { value: candidate, hit: candidate };
    }
  }
  return best;
}

export function EditorCanvas({
  page,
  elements,
  data,
  mode,
  selectedId,
  zoom,
  onSelect,
  onChange,
  onDropField,
}: {
  page: PageSetup;
  elements: CanvasElement[];
  data: unknown;
  mode: "design" | "preview";
  selectedId: string | null;
  zoom: number;
  onSelect: (id: string | null) => void;
  onChange: (elements: CanvasElement[]) => void;
  onDropField?: (payload: { kind: string; value: string }, position: { x: number; y: number; page: number }) => void;
}) {
  const [guides, setGuides] = useState<Guide[]>([]);
  const dragRef = useRef<{
    id: string;
    handle: Handle | "move";
    startX: number;
    startY: number;
    origin: CanvasElement;
  } | null>(null);

  const live = mode === "preview";
  const { pageCount, fragments } = paginate(elements, page, data, { live });

  const commit = useCallback(
    (id: string, patch: Partial<CanvasElement>) => {
      onChange(
        elements.map((element) => (element.id === id ? { ...element, ...patch } : element)),
      );
    },
    [elements, onChange],
  );

  const handlePointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / zoom;
    const dy = (event.clientY - drag.startY) / zoom;
    const origin = drag.origin;

    const peers = elements.filter(
      (element) => element.id !== drag.id && element.page === origin.page,
    );
    const xCandidates = [
      page.margin.left,
      page.width - page.margin.right,
      page.width / 2,
      ...peers.flatMap((peer) => [peer.x, peer.x + peer.w, peer.x + peer.w / 2]),
    ];
    const yCandidates = [
      page.margin.top,
      page.height - page.margin.bottom,
      ...peers.flatMap((peer) => [peer.y, peer.y + peer.h, peer.y + peer.h / 2]),
    ];

    const nextGuides: Guide[] = [];

    if (drag.handle === "move") {
      const left = snapValue(origin.x + dx, xCandidates);
      const right = snapValue(origin.x + dx + origin.w, xCandidates);
      const top = snapValue(origin.y + dy, yCandidates);
      const bottom = snapValue(origin.y + dy + origin.h, yCandidates);

      let x = origin.x + dx;
      if (left.hit !== undefined) {
        x = left.value;
        nextGuides.push({ axis: "x", at: left.value, page: origin.page });
      } else if (right.hit !== undefined) {
        x = right.value - origin.w;
        nextGuides.push({ axis: "x", at: right.value, page: origin.page });
      }

      let y = origin.y + dy;
      if (top.hit !== undefined) {
        y = top.value;
        nextGuides.push({ axis: "y", at: top.value, page: origin.page });
      } else if (bottom.hit !== undefined) {
        y = bottom.value - origin.h;
        nextGuides.push({ axis: "y", at: bottom.value, page: origin.page });
      }

      commit(drag.id, { x: Math.round(x), y: Math.round(y) });
    } else {
      let { x, y, w, h } = origin;
      const handle = drag.handle;
      if (handle.includes("e")) w = origin.w + dx;
      if (handle.includes("s")) h = origin.h + dy;
      if (handle.includes("w")) {
        const snapped = snapValue(origin.x + dx, xCandidates);
        if (snapped.hit !== undefined) nextGuides.push({ axis: "x", at: snapped.value, page: origin.page });
        x = snapped.value;
        w = origin.w + (origin.x - x);
      }
      if (handle.includes("n")) {
        const snapped = snapValue(origin.y + dy, yCandidates);
        if (snapped.hit !== undefined) nextGuides.push({ axis: "y", at: snapped.value, page: origin.page });
        y = snapped.value;
        h = origin.h + (origin.y - y);
      }
      if (handle.includes("e")) {
        const snapped = snapValue(x + w, xCandidates);
        if (snapped.hit !== undefined) {
          nextGuides.push({ axis: "x", at: snapped.value, page: origin.page });
          w = snapped.value - x;
        }
      }
      if (handle.includes("s")) {
        const snapped = snapValue(y + h, yCandidates);
        if (snapped.hit !== undefined) {
          nextGuides.push({ axis: "y", at: snapped.value, page: origin.page });
          h = snapped.value - y;
        }
      }
      commit(drag.id, {
        x: Math.round(x),
        y: Math.round(y),
        w: Math.max(16, Math.round(w)),
        h: Math.max(12, Math.round(h)),
      });
    }

    setGuides(nextGuides);
  };

  const endDrag = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setGuides([]);
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
  };

  return (
    <div className="flex flex-col items-center gap-8 py-8">
      {Array.from({ length: pageCount }).map((_, pageIndex) => {
        const pageNumber = pageIndex + 1;
        const pageFragments = fragments.filter((fragment) => fragment.page === pageNumber);
        return (
          <div
            key={pageNumber}
            className="relative shrink-0 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.85)]"
            style={{
              width: page.width * zoom,
              height: page.height * zoom,
              background: page.background,
            }}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) onSelect(null);
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onDragOver={(event) => {
              if (onDropField) event.preventDefault();
            }}
            onDrop={(event) => {
              if (!onDropField) return;
              event.preventDefault();
              const raw = event.dataTransfer.getData("application/x-reportflow");
              if (!raw) return;
              const rect = event.currentTarget.getBoundingClientRect();
              onDropField(JSON.parse(raw), {
                x: Math.round((event.clientX - rect.left) / zoom),
                y: Math.round((event.clientY - rect.top) / zoom),
                page: pageNumber,
              });
            }}
          >
            <div
              className="pointer-events-none absolute origin-top-left"
              style={{
                width: page.width,
                height: page.height,
                transform: `scale(${zoom})`,
              }}
            >
              {mode === "design" && (
                <div
                  className="absolute border border-dashed"
                  style={{
                    borderColor: "rgba(245,158,11,0.35)",
                    left: page.margin.left,
                    top: page.margin.top,
                    width: page.width - page.margin.left - page.margin.right,
                    height: page.height - page.margin.top - page.margin.bottom,
                  }}
                />
              )}

              {pageFragments.map((fragment) => {
                const element = fragment.element;
                const selected = mode === "design" && selectedId === element.id;
                return (
                  <div
                    key={fragment.key}
                    className={cn(
                      "absolute",
                      mode === "design" && "pointer-events-auto cursor-move",
                      mode === "design" && !selected && "hover:outline hover:outline-primary/40",
                      selected && "outline-2 outline-primary",
                    )}
                    style={{
                      left: element.x,
                      top: fragment.y,
                      width: element.w,
                      height: fragment.height,
                    }}
                    onPointerDown={(event) => {
                      if (mode !== "design" || element.locked) return;
                      event.stopPropagation();
                      onSelect(element.id);
                      dragRef.current = {
                        id: element.id,
                        handle: "move",
                        startX: event.clientX,
                        startY: event.clientY,
                        origin: element,
                      };
                    }}
                  >
                    <ElementView
                      fragment={fragment}
                      data={data}
                      live={live}
                      pageNumber={pageNumber}
                      pageCount={pageCount}
                    />

                    {selected &&
                      HANDLES.map((handle) => (
                        <span
                          key={handle.key}
                          className={cn(
                            "absolute size-2 rounded-sm border border-primary bg-background",
                            handle.className,
                          )}
                          style={{ cursor: handle.cursor }}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            dragRef.current = {
                              id: element.id,
                              handle: handle.key,
                              startX: event.clientX,
                              startY: event.clientY,
                              origin: element,
                            };
                          }}
                        />
                      ))}
                  </div>
                );
              })}

              {guides
                .filter((guide) => guide.page === pageNumber)
                .map((guide, index) =>
                  guide.axis === "x" ? (
                    <span
                      key={index}
                      className="absolute top-0 h-full w-px bg-primary/70"
                      style={{ left: guide.at }}
                    />
                  ) : (
                    <span
                      key={index}
                      className="absolute left-0 h-px w-full bg-primary/70"
                      style={{ top: guide.at }}
                    />
                  ),
                )}
            </div>

            <span className="text-mono absolute -bottom-6 left-0 text-[11px] text-muted-foreground">
              Page {pageNumber} / {pageCount}
            </span>
          </div>
        );
      })}
    </div>
  );
}
