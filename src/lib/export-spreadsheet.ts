export type Cell = {
  v?: string | number | boolean | null;
  f?: string;
  si?: string;
  s?: string | CellStyle;
  p?: { body?: { dataStream?: string } };
};
export type CellStyle = {
  bl?: number;
  it?: number;
  ul?: { s?: number };
  st?: { s?: number };
  fs?: number;
  ff?: string;
  cl?: { rgb?: string };
  bg?: { rgb?: string };
  ht?: number;
  vt?: number;
  tb?: number;
  n?: { pattern?: string };
};
export type Worksheet = {
  id?: string;
  name: string;
  cellData?: Record<string, Record<string, Cell>>;
  rowData?: Record<string, { h?: number; hd?: number }>;
  columnData?: Record<string, { w?: number; hd?: number }>;
  mergeData?: {
    startRow: number;
    endRow: number;
    startColumn: number;
    endColumn: number;
  }[];
};
export type Workbook = {
  sheetOrder: string[];
  sheets: Record<string, Worksheet>;
  styles?: Record<string, CellStyle>;
};
export function cellValue(cell: Cell) {
  return cell.v ?? cell.p?.body?.dataStream?.replace(/\r?\n$/, "") ?? "";
}
export function sheetMatrix(sheet: Worksheet) {
  const entries = Object.entries(sheet.cellData || {});
  if (!entries.length) return [[""]];
  const lastRow = Math.max(...entries.map(([r]) => Number(r)));
  const cols = entries.flatMap(([, row]) => Object.keys(row).map(Number));
  const lastCol = cols.length ? Math.max(...cols) : 0;
  if ((lastRow + 1) * (lastCol + 1) > 2000000)
    throw Error(
      "This sheet’s used range is too large for a text export. Export XLSX or JSON, or remove far-away cells.",
    );
  return Array.from({ length: lastRow + 1 }, (_, r) =>
    Array.from({ length: lastCol + 1 }, (_, c) =>
      cellValue(sheet.cellData?.[r]?.[c] || {}),
    ),
  );
}
function argb(value?: string) {
  if (!value) return undefined;
  const rgb = value.replace("#", "");
  return /^[0-9a-f]{6}$/i.test(rgb) ? "FF" + rgb : undefined;
}
export async function buildXlsx(model: Workbook, name: string) {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  book.creator = "Syrka Tables";
  book.title = name;
  book.calcProperties.fullCalcOnLoad = true;
  for (const id of model.sheetOrder) {
    const source = model.sheets[id];
    if (!source) continue;
    let sheetName =
      source.name.replace(/[\\/*?:\[\]]/g, " ").slice(0, 31) || "Sheet";
    const original = sheetName;
    let duplicate = 1;
    while (book.getWorksheet(sheetName))
      sheetName = original.slice(0, 26) + ` (${duplicate++})`;
    const sheet = book.addWorksheet(sheetName);
    const anchors = new Map<string, string>();
    const sharedCells: string[] = [];
    for (const [r, row] of Object.entries(source.cellData || {}))
      for (const [c, cell] of Object.entries(row))
        if (cell.si && cell.f)
          anchors.set(
            cell.si,
            sheet.getCell(Number(r) + 1, Number(c) + 1).address,
          );
    for (const [r, row] of Object.entries(source.cellData || {})) {
      for (const [c, cell] of Object.entries(row)) {
        const out = sheet.getCell(Number(r) + 1, Number(c) + 1);
        const value = cellValue(cell);
        if (cell.f)
          out.value = {
            formula: cell.f.replace(/^=/, ""),
            result: cell.v ?? undefined,
          };
        else if (cell.si) {
          const anchor = anchors.get(cell.si);
          if (!anchor)
            throw Error(
              "A shared formula could not be resolved. Download JSON to preserve the full workbook.",
            );
          out.value = { sharedFormula: anchor, result: cell.v ?? undefined };
          sharedCells.push(out.address);
        } else out.value = value;
        const style =
          typeof cell.s === "string" ? model.styles?.[cell.s] : cell.s;
        if (style) {
          out.font = {
            name: style.ff || "Arial",
            size: style.fs || 11,
            bold: style.bl === 1,
            italic: style.it === 1,
            underline: style.ul?.s === 1,
            strike: style.st?.s === 1,
            color: argb(style.cl?.rgb)
              ? { argb: argb(style.cl?.rgb) }
              : undefined,
          };
          const bg = argb(style.bg?.rgb);
          if (bg)
            out.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: bg },
            };
          out.alignment = {
            horizontal:
              ({ 1: "left", 2: "center", 3: "right" } as const)[
                style.ht as 1
              ] || "left",
            vertical:
              ({ 1: "top", 2: "middle", 3: "bottom" } as const)[
                style.vt as 1
              ] || "top",
            wrapText: style.tb === 3,
          };
          if (style.n?.pattern) out.numFmt = style.n.pattern;
        }
      }
    }
    for (const address of sharedCells) {
      const cell = sheet.getCell(address);
      const formula = cell.formula;
      if (!formula)
        throw Error(
          "A shared formula could not be resolved. Download JSON to preserve the workbook.",
        );
      cell.value = { formula, result: cell.result };
    }
    for (const [row, data] of Object.entries(source.rowData || {})) {
      if (data.h) sheet.getRow(Number(row) + 1).height = data.h * 0.75;
      if (data.hd) sheet.getRow(Number(row) + 1).hidden = true;
    }
    for (const [col, data] of Object.entries(source.columnData || {})) {
      if (data.w)
        sheet.getColumn(Number(col) + 1).width = Math.max(1, (data.w - 5) / 7);
      if (data.hd) sheet.getColumn(Number(col) + 1).hidden = true;
    }
    for (const merge of source.mergeData || [])
      sheet.mergeCells(
        merge.startRow + 1,
        merge.startColumn + 1,
        merge.endRow + 1,
        merge.endColumn + 1,
      );
  }
  if (!book.worksheets.length) book.addWorksheet("Sheet 1");
  const buffer = await book.xlsx.writeBuffer();
  return new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
