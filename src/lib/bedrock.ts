import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export function getBedrockClient() {
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  if (!region) throw new Error("Missing AWS_REGION (or AWS_DEFAULT_REGION)");
  return new BedrockRuntimeClient({ region });
}

export async function invokeClaudeVisionJson(args: {
  imageBase64: string;
  mediaType: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  const client = getBedrockClient();
  const modelId = process.env.BEDROCK_MODEL_ID ?? requireEnv("BEDROCK_MODEL_ID");

  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: args.maxTokens ?? 1200,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: args.mediaType,
              data: args.imageBase64,
            },
          },
          { type: "text", text: args.prompt },
        ],
      },
    ],
  });

  const res = await client.send(
    new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: new TextEncoder().encode(body),
    }),
  );

  const text = new TextDecoder().decode(res.body);
  const parsed = JSON.parse(text) as {
    content?: Array<{ type: string; text?: string }>;
    output?: unknown;
  };

  const out = parsed?.content?.map((c) => c.text ?? "").join("\n").trim();
  if (!out) throw new Error("Bedrock response did not include text content");
  return out;
}


