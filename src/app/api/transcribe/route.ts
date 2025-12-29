import { NextResponse } from "next/server";
import { z } from "zod";

import { invokeClaudeVisionJson } from "@/lib/bedrock";
import { extractJsonObject } from "@/lib/extractJson";
import { buildReceiptPrompt } from "@/lib/prompt";
import { ReceiptSchema } from "@/lib/receiptSchema";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("image");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Missing form field: image" }, { status: 400 });
    }

    if (!file.type?.startsWith("image/")) {
      return NextResponse.json({ ok: false, error: "File must be an image" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: `Image too large (max ${MAX_BYTES} bytes)` },
        { status: 413 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const imageBase64 = bytes.toString("base64");

    const modelText = await invokeClaudeVisionJson({
      imageBase64,
      mediaType: file.type || "image/jpeg",
      prompt: buildReceiptPrompt(),
    });

    const json = extractJsonObject(modelText);
    const parsed = ReceiptSchema.safeParse(json);
    if (!parsed.success) {
      const details = z.prettifyError(parsed.error);
      return NextResponse.json(
        { ok: false, error: "Model returned JSON that didn't match the expected schema", details },
        { status: 422 },
      );
    }

    return NextResponse.json({ ok: true, receipt: parsed.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    // Common AWS credential failure modes during local dev (SSO/STS token expiry).
    const lower = message.toLowerCase();
    const isAuthExpired =
      lower.includes("session has expired") ||
      lower.includes("expiredtoken") ||
      lower.includes("expired token") ||
      lower.includes("invalidclienttokenid") ||
      lower.includes("security token included in the request is expired") ||
      lower.includes("please reauthenticate");

    if (isAuthExpired) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "AWS credentials expired. Refresh them (e.g. `aws sso login --profile <profile>` or `aws login --profile <profile>`) and restart the dev server.",
        },
        { status: 401 },
      );
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}


