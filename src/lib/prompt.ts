export function buildReceiptPrompt() {
  return [
    "You are a careful OCR + information extraction system.",
    "Given an image of a receipt or invoice, first crop in the area of the receipt or invoice.", 
    "Then, extract structured data as JSON ONLY.",
    "",
    "Rules:",
    "- Output MUST be a single valid JSON object (no markdown, no code fences, no commentary).",
    "- If a field is unknown, omit it or use null (prefer omitting).",
    "- Prefer ISO-8601 date (YYYY-MM-DD) and 24h time (HH:mm) when possible.",
    "- Amounts should be numbers, not strings (e.g. 12.34).",
    "",
    "Return this JSON shape:",
    "{",
    '  "document_type": "receipt" | "invoice" | "other",',
    '  "merchant": { "name": string, "address"?: string, "phone"?: string, "website"?: string },',
    '  "transaction": { "date"?: string, "time"?: string, "receipt_number"?: string, "payment_method"?: string, "card_last4"?: string, "currency"?: string },',
    '  "totals": { "subtotal"?: number, "tax"?: number, "tip"?: number, "discount"?: number, "total"?: number },',
    '  "line_items": [ { "description": string, "quantity"?: number, "unit_price"?: number, "total_price"?: number } ],',
    '  "notes": string[]',
    "}",
  ].join("\n");
}


