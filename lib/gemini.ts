import { GoogleGenerativeAI } from "@google/generative-ai";

export const MODEL_ID = process.env.GEMINI_MODEL || "gemini-flash-latest";
const FALLBACK_MODEL_IDS = ["gemini-1.5-flash-latest", "gemini-1.5-flash", "gemini-1.5-flash-8b-latest"];
const MAX_RETRIES_PER_MODEL = 2;

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  return new GoogleGenerativeAI(key);
}

type GenerativeModel = ReturnType<GoogleGenerativeAI["getGenerativeModel"]>;

function modelCandidates(): string[] {
  const raw = [MODEL_ID, ...FALLBACK_MODEL_IDS];
  const deduped = [...new Set(raw.map((m) => m.trim()).filter(Boolean))];
  return deduped;
}

function isUnsupportedModelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("404") ||
    message.includes("not found for api version") ||
    message.includes("is not supported for generatecontent")
  );
}

function isRetriableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("429") ||
    message.includes("503") ||
    message.includes("too many requests") ||
    message.includes("rate limit") ||
    message.includes("temporarily busy") ||
    message.includes("temporarily unavailable") ||
    message.includes("high demand") ||
    message.includes("overloaded")
  );
}

function retryDelayMs(error: unknown, attempt: number): number {
  const message = error instanceof Error ? error.message : "";
  const retryIn = message.match(/retry in\s+([\d.]+)s/i);
  if (retryIn?.[1]) {
    const sec = Number(retryIn[1]);
    if (Number.isFinite(sec) && sec > 0) return Math.ceil(sec * 1000);
  }
  const retryDelay = message.match(/"retryDelay":"(\d+)s"/i);
  if (retryDelay?.[1]) {
    const sec = Number(retryDelay[1]);
    if (Number.isFinite(sec) && sec > 0) return sec * 1000;
  }
  return Math.min(5000, 800 * (attempt + 1));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withModelFallback<T>({
  systemInstruction,
  run,
}: {
  systemInstruction?: string;
  run: (model: GenerativeModel) => Promise<T>;
}): Promise<T> {
  const client = getClient();
  let lastError: unknown;

  for (const modelId of modelCandidates()) {
    for (let attempt = 0; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
      try {
        const model = client.getGenerativeModel({
          model: modelId,
          ...(systemInstruction ? { systemInstruction } : {}),
        });
        return await run(model);
      } catch (error) {
        lastError = error;
        if (isUnsupportedModelError(error)) break;
        if (isRetriableError(error)) {
          if (attempt < MAX_RETRIES_PER_MODEL) {
            await sleep(retryDelayMs(error, attempt));
            continue;
          }
          break;
        }
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("No supported Gemini models available.");
}

export type PitchAnalysisResult = {
  bullThesis: string;
  bearThesis: string;
  keyRisks: string[];
  comparables: string[];
  positionSizeRange: string;
};

export async function analyzePitchPdf(buffer: ArrayBuffer): Promise<PitchAnalysisResult> {
  const base64 = Buffer.from(buffer).toString("base64");

  const prompt = `You are a buy-side equity analyst. Analyze the attached research PDF and respond ONLY with valid JSON matching this schema (no markdown):
{
  "bullThesis": string,
  "bearThesis": string,
  "keyRisks": string[],
  "comparables": string[],
  "positionSizeRange": string (e.g. "0.5%–2% of portfolio for a starter position")
}
Be concise and institutional in tone.`;

  const result = await withModelFallback({
    run: async (gen) =>
      gen.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: "application/pdf",
            data: base64,
          },
        },
      ]),
  });

  const text = result.response.text().trim();
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(cleaned) as PitchAnalysisResult;
  return {
    bullThesis: String(parsed.bullThesis ?? ""),
    bearThesis: String(parsed.bearThesis ?? ""),
    keyRisks: Array.isArray(parsed.keyRisks) ? parsed.keyRisks.map(String) : [],
    comparables: Array.isArray(parsed.comparables) ? parsed.comparables.map(String) : [],
    positionSizeRange: String(parsed.positionSizeRange ?? ""),
  };
}

export async function generateMacroBriefing(context: string): Promise<string> {
  const prompt = `Write a single ~200 word plain-English macro briefing for a student-led equity fund desk. No bullet points. Reference the data and headlines below where useful.\n\n${context}`;
  const result = await withModelFallback({
    run: async (gen) => gen.generateContent(prompt),
  });
  return result.response.text().trim();
}

export async function portfolioChatReply(systemPrompt: string, userMessages: { role: "user" | "model"; text: string }[]) {
  const history = userMessages.slice(0, -1).map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("model" as const),
    parts: [{ text: m.text }],
  }));
  const last = userMessages[userMessages.length - 1];
  if (!last || last.role !== "user") {
    throw new Error("Last message must be user");
  }
  const result = await withModelFallback({
    systemInstruction: systemPrompt,
    run: async (gen) => {
      const chat = gen.startChat({ history });
      return chat.sendMessage(last.text);
    },
  });
  return result.response.text().trim();
}

export async function portfolioChatReplyStream(
  systemPrompt: string,
  userMessages: { role: "user" | "model"; text: string }[],
): Promise<ReadableStream<Uint8Array>> {
  const history = userMessages.slice(0, -1).map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("model" as const),
    parts: [{ text: m.text }],
  }));
  const last = userMessages[userMessages.length - 1];
  if (!last || last.role !== "user") {
    throw new Error("Last message must be user");
  }
  const result = await withModelFallback({
    systemInstruction: systemPrompt,
    run: async (gen) => {
      const chat = gen.startChat({ history });
      return chat.sendMessageStream(last.text);
    },
  });
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) controller.enqueue(encoder.encode(text));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
