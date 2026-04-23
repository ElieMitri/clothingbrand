import * as XLSX from "xlsx";

export interface ExcelImportedProduct {
  name: string;
  category?: string;
  price?: number;
  original_price?: number;
  commission_percentage?: number;
  stock?: number;
}

const normalize = (value: unknown) => String(value ?? "").trim();

const parseNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = normalize(value).replace(/,/g, "");
  if (!raw) return NaN;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const normalizeCommission = (value: unknown) => {
  const parsed = parseNumber(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  if (parsed <= 1) return parsed * 100;
  return parsed;
};

const findColumnIndex = (headers: string[], candidates: string[]) => {
  const normalizedHeaders = headers.map((header) => normalize(header).toLowerCase());
  const candidateSet = new Set(candidates.map((entry) => entry.toLowerCase()));
  return normalizedHeaders.findIndex((header) => candidateSet.has(header));
};

export const parseExcelProducts = async (file: File): Promise<ExcelImportedProduct[]> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", dense: true });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: true,
  });

  const headerIndex = rows.findIndex((row) => {
    const values = Array.isArray(row) ? row.map((cell) => normalize(cell).toLowerCase()) : [];
    return values.includes("item name") && values.includes("selling price");
  });

  if (headerIndex < 0) {
    throw new Error("Could not find expected headers: item name and selling price.");
  }

  const headers = rows[headerIndex].map((cell) => normalize(cell));
  const itemNameIndex = findColumnIndex(headers, ["item name", "name", "product"]);
  const sellingPriceIndex = findColumnIndex(headers, ["selling price", "price"]);
  const commissionIndex = findColumnIndex(headers, ["commission", "commission %", "commision"]);

  if (itemNameIndex < 0 || sellingPriceIndex < 0) {
    throw new Error("Missing required columns in Excel file.");
  }

  const imported: ExcelImportedProduct[] = [];
  let currentCategory = "";

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!Array.isArray(row)) continue;

    const itemName = normalize(row[itemNameIndex]);
    const price = parseNumber(row[sellingPriceIndex]);
    const commission = commissionIndex >= 0 ? normalizeCommission(row[commissionIndex]) : 0;

    if (!itemName) continue;

    const isCategoryRow = !Number.isFinite(price);
    if (isCategoryRow) {
      currentCategory = itemName;
      continue;
    }

    imported.push({
      name: itemName,
      category: currentCategory || "Supplements",
      price: Math.max(0, price),
      original_price: Math.max(0, price),
      commission_percentage: commission,
      stock: 0,
    });
  }

  return imported;
};
