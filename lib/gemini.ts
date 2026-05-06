import { GoogleGenerativeAI } from "@google/generative-ai";

export const MODEL_ID = "gemini-flash-latest";

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  return new GoogleGenerativeAI(key);
}

export type PitchAnalysisResult = {
  bullThesis: string;
  bearThesis: string;
  keyRisks: string[];
  comparables: string[];
  positionSizeRange: string;
};

export async function analyzePitchPdf(buffer: ArrayBuffer): Promise<PitchAnalysisResult> {
  const gen = getClient().getGenerativeModel({ model: MODEL_ID });
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

  const result = await gen.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType: "application/pdf",
        data: base64,
      },
    },
  ]);

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
  const gen = getClient().getGenerativeModel({ model: MODEL_ID });
  const prompt = `Write a single ~200 word plain-English macro briefing for a student-led equity fund desk. No bullet points. Reference the data and headlines below where useful.\n\n${context}`;
  const result = await gen.generateContent(prompt);
  return result.response.text().trim();
}

export async function portfolioChatReply(systemPrompt: string, userMessages: { role: "user" | "model"; text: string }[]) {
  const gen = getClient().getGenerativeModel({
    model: MODEL_ID,
    systemInstruction: systemPrompt,
  });
  const history = userMessages.slice(0, -1).map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("model" as const),
    parts: [{ text: m.text }],
  }));
  const last = userMessages[userMessages.length - 1];
  if (!last || last.role !== "user") {
    throw new Error("Last message must be user");
  }
  const chat = gen.startChat({ history });
  const result = await chat.sendMessage(last.text);
  return result.response.text().trim();
}
