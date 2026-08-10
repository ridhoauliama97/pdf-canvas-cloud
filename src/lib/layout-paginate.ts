import { getPath } from "@/lib/template-engine";
import type { CanvasElement, PageSetup } from "@/types/template";

export interface Fragment {
  key: string;
  element: CanvasElement;
  page: number;
  y: number;
  height: number;
  /** rows for this table fragment */
  rows?: unknown[];
  rowOffset?: number;
  showHeader?: boolean;
  continued?: boolean;
}

export interface PaginatedLayout {
  pageCount: number;
  fragments: Fragment[];
}

function tableRowHeight(element: CanvasElement): number {
  return element.rowHeight ?? 28;
}

/**
 * Lay out elements across pages. Table elements bound to an array grow with
 * their data, spill onto following pages, and push down the elements that sit
 * below them on the same page.
 */
export function paginate(
  elements: CanvasElement[],
  page: PageSetup,
  data: unknown,
  options: { live: boolean } = { live: true },
): PaginatedLayout {
  const fragments: Fragment[] = [];
  let pageCount = Math.max(1, page.pageCount);
  const shifts: { page: number; fromY: number; delta: number }[] = [];

  const tables = elements.filter((element) => element.type === "table");
  const others = elements.filter((element) => element.type !== "table");

  for (const element of tables) {
    const rowHeight = tableRowHeight(element);
    const headerHeight = element.showHeader === false ? 0 : rowHeight;
    const rawRows = options.live && element.arrayBinding ? getPath(data, element.arrayBinding) : null;
    const rows = Array.isArray(rawRows) ? rawRows : null;

    if (!rows) {
      fragments.push({
        key: element.id,
        element,
        page: element.page,
        y: element.y,
        height: element.h,
        showHeader: element.showHeader !== false,
      });
      continue;
    }

    const firstAvailable = page.height - page.margin.bottom - element.y - headerHeight;
    const firstFit = Math.max(1, Math.floor(firstAvailable / rowHeight));
    const perPage = Math.max(
      1,
      Math.floor((page.height - page.margin.top - page.margin.bottom - headerHeight) / rowHeight),
    );

    const firstRows = rows.slice(0, firstFit);
    const firstHeight = headerHeight + firstRows.length * rowHeight;
    fragments.push({
      key: `${element.id}#0`,
      element,
      page: element.page,
      y: element.y,
      height: firstHeight,
      rows: firstRows,
      rowOffset: 0,
      showHeader: element.showHeader !== false,
    });

    const delta = firstHeight - element.h;
    if (delta !== 0) {
      shifts.push({ page: element.page, fromY: element.y + element.h - 1, delta });
    }

    let index = firstFit;
    let currentPage = element.page;
    while (index < rows.length) {
      currentPage += 1;
      pageCount = Math.max(pageCount, currentPage);
      const chunk = rows.slice(index, index + perPage);
      fragments.push({
        key: `${element.id}#${index}`,
        element,
        page: currentPage,
        y: page.margin.top,
        height: headerHeight + chunk.length * rowHeight,
        rows: chunk,
        rowOffset: index,
        showHeader: element.showHeader !== false,
        continued: true,
      });
      index += perPage;
    }
    pageCount = Math.max(pageCount, element.page);
  }

  for (const element of others) {
    const shift = shifts
      .filter((entry) => entry.page === element.page && element.y >= entry.fromY)
      .reduce((total, entry) => total + entry.delta, 0);
    fragments.push({
      key: element.id,
      element,
      page: element.page,
      y: element.y + shift,
      height: element.h,
    });
    pageCount = Math.max(pageCount, element.page);
  }

  return { pageCount, fragments };
}
