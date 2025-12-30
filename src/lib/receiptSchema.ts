import { z } from "zod";

function parseFlexibleNumber(input: string): number {
  // Supports common receipt formats including Turkish locale:
  // - "1.234,56" -> 1234.56
  // - "1,234.56" -> 1234.56
  // - "123,45"   -> 123.45
  // - "₺1.234,56" -> 1234.56
  let s = input.trim();
  if (!s) return NaN;
  s = s.replace(/\s+/g, "");

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    // If comma appears after dot, assume comma is decimal separator.
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(/,/g, ".");
    } else {
      // Otherwise dot is decimal separator; commas are thousands.
      s = s.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    // Only comma present -> treat as decimal separator.
    s = s.replace(/,/g, ".");
  }

  // Remove currency symbols and other noise, keep digits, dot, and minus.
  s = s.replace(/[^\d.-]/g, "");
  // If multiple dots remain (rare), keep the last as decimal separator.
  const parts = s.split(".");
  if (parts.length > 2) {
    const dec = parts.pop();
    s = `${parts.join("")}.${dec ?? ""}`;
  }
  return Number(s);
}

const num = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "string" ? parseFlexibleNumber(v) : v))
  .refine((v) => Number.isFinite(v), "Expected a finite number");

/**
 * IMPORTANT:
 * This app is optimized to produce JSON shaped exactly like the user's Excel columns.
 * Keys are the literal column headers (including spaces and Turkish characters).
 */
export const ReceiptSchema = z
  .object({
    // "NO" is a sequential row number in Excel; it may not exist on a receipt image.
    // We allow it to be omitted/null and fill it during export.
    NO: z.union([z.number(), z.null()]).optional(),

    // Receipt number
    "FİŞ NO": z.string().min(1).optional(),

    // Transaction date (as it appears on the receipt; prefer DD/MM/YYYY for Turkish receipts)
    TARİH: z.string().min(1).optional(),

    // Vendor / merchant
    "FİRMA ADI": z.string().min(1).optional(),

    // KDV amounts attached to each rate (tax amount, not matrah)
    "KDV %1": num.optional(),
    "KDV %10": num.optional(),
    "KDV %20": num.optional(),

    // Total amount (grand total)
    "TOPLAM TUTAR": num.optional(),

    // Tax office short address/name
    "Vergi Dairesi": z.string().min(1).optional(),

    // Tax number ("VKN" / "TCKN" / "Vergi No") — often directly under the tax office
    "Vergi No": z.string().min(1).optional(),
  })
  .strict();

export type Receipt = z.infer<typeof ReceiptSchema>;


