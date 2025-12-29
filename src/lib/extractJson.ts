export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Model returned empty output");

  // Common case: the model returns pure JSON.
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  // Fallback: strip code fences and extract the outermost JSON object.
  const unfenced = trimmed
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();

  const first = unfenced.indexOf("{");
  const last = unfenced.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("Could not locate a JSON object in model output");
  }

  const candidate = unfenced.slice(first, last + 1);
  return JSON.parse(candidate);
}


