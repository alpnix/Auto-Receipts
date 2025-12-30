export function buildReceiptPrompt() {
  let raw_instructions = 'so as you can see from the attached image, each line of item in the receipt has a tax amount and a fee amount. When you are calculating the %1, %10, %20, or any other percentage that you might see in the receipt. First, I want you to aggregate all of the %1 together, all of the %10 together and all of the %20 together. Then, these are the prices with tax (KDV) included for each category. And I want you to find the tax amount for each relevant category. For example, if we have 500 TRY for %1 category in total, we will have to do a calculation like 1.01x = 500, and find x to be 495, then get 495/100 bc of %1 tax, and get the tax amount to be 4.95 so we just put in "%1": "4.95" and so on.'
  return [
    "You are a careful OCR + information extraction system.",
    "Given an image of a receipt or invoice, first crop in the area of the receipt or invoice.",
    "Then, extract structured data as JSON ONLY.",
    "",
    "Rules:",
    "- Output MUST be a single valid JSON object (no markdown, no code fences, no commentary).",
    "- Output MUST contain ONLY the keys listed in the JSON shape below. Do not add any extra keys.",
    "- If a value is unknown, omit that key (preferred) or set it to null.",
    "- Amounts must be numbers (not strings). Use dot as decimal separator in JSON (e.g. 1368.01).",
    "- For Turkish receipts: recognize 'Fiş No'/'Belge No', 'Vergi Dairesi' (tax office), and 'VKN'/'TCKN'/'Vergi No' (tax number, often right below the tax office).",
    "- For KDV: populate the amount for each rate (e.g. %1/%10/%20) as the KDV TAX AMOUNT ONLY (not matrah, not tax-included totals). If a rate is absent, omit that key.",
    "- Many receipts show line items with a KDV rate and a tax-included line total (sometimes written as 'KDV'li', 'Tutar', 'Toplam', or shown next to the % rate). In those cases:",
    "  - First aggregate (SUM) all tax-included amounts for the SAME KDV rate across ALL line items.",
    "  - Then compute the tax-only amount for that rate from the tax-included total:",
    "      gross = sum of tax-included amounts for that rate",
    "      net = gross / (1 + rate/100)",
    "      tax = gross - net",
    "    Round the final tax amount to 2 decimals (e.g. 4.95).",
    "  - Example: gross=500 at %1 => net=500/1.01=495.0495..., tax=500-495.0495...=4.9505... => 4.95",
    "- If the receipt already provides an explicit KDV breakdown table with tax amounts per rate (e.g. 'KDV TUTARI' for %1/%10/%20), prefer those explicit tax amounts over recomputing.",
    "- Only output the keys listed below (NO, FİŞ NO, TARİH, FİRMA ADI, KDV %1, KDV %10, KDV %20, TOPLAM TUTAR, Vergi Dairesi, Vergi No). If the receipt contains other KDV rates, ignore them (do not add new keys).",
    "",
    "Return this JSON shape (keys must match exactly):",
    "{",
    '  "NO"?: number | null,',
    '  "FİŞ NO"?: string,',
    '  "TARİH"?: string,',
    '  "FİRMA ADI"?: string,',
    '  "KDV %1"?: number,',
    '  "KDV %10"?: number,',
    '  "KDV %20"?: number,',
    '  "TOPLAM TUTAR"?: number,',
    '  "Vergi Dairesi"?: string,',
    '  "Vergi No"?: string',
    "}",
  ].join("\n");
}




""