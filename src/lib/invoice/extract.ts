import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { DEMO_EXTRACTION } from "./mock";
import { SYSTEM_PROMPT, USER_PROMPT } from "./prompt";
import { extractionJsonSchema, InvoiceExtractionSchema, type InvoiceExtraction } from "./schema";

export type ExtractFile = { mimeType: string; data: Uint8Array };
export type ExtractResult = { extraction: InvoiceExtraction; model: string; mock: boolean };

export class ExtractionError extends Error {}

export const DEFAULT_MODEL = "gemini-3.8-flash";

export function aiConfigured() {
  return !!process.env.GEMINI_API_KEY?.trim();
}

function friendlyError(err: unknown): string {
  const text = String((err as { message?: string })?.message ?? err);
  if (/API key not valid|API_KEY_INVALID|permission denied|PERMISSION_DENIED/i.test(text)) {
    return "The Gemini API key was rejected. Check GEMINI_API_KEY in the server settings.";
  }
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(text)) {
    return "The AI service's free limit was reached. Wait a minute and press Retry, or use a paid key.";
  }
  if (/not found|NOT_FOUND|is not supported/i.test(text)) {
    return `The AI model "${process.env.GEMINI_MODEL || DEFAULT_MODEL}" isn't available. Set GEMINI_MODEL to a current Flash model.`;
  }
  if (/deadline|timeout|ETIMEDOUT|503|UNAVAILABLE/i.test(text)) {
    return "The AI service took too long or is busy. Press Retry.";
  }
  return "The invoice couldn't be read. Try a sharper photo or the PDF, then Retry.";
}

/**
 * Reads an invoice with Gemini structured output. The model only copies printed values;
 * all arithmetic happens later in our code (src/lib/pricing.ts).
 * Without GEMINI_API_KEY, returns the demo extraction instead.
 */
export async function extractInvoice(files: ExtractFile[]): Promise<ExtractResult> {
  if (!aiConfigured()) {
    await new Promise((r) => setTimeout(r, 1200));
    return { extraction: structuredClone(DEMO_EXTRACTION), model: "demo", mock: true };
  }

  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!.trim() });
  const fileParts = files.map((f) => ({
    inlineData: { mimeType: f.mimeType, data: Buffer.from(f.data).toString("base64") },
  }));

  const call = (extraText: string | null, withThinking: boolean) =>
    ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [...fileParts, { text: USER_PROMPT }, ...(extraText ? [{ text: extraText }] : [])] }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: extractionJsonSchema(),
        temperature: 0,
        ...(withThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
      },
    });

  const parse = (text: string | undefined) => {
    try {
      return InvoiceExtractionSchema.safeParse(JSON.parse(text ?? ""));
    } catch {
      return { success: false as const, error: new Error("Response was not valid JSON") };
    }
  };

  try {
    let response;
    try {
      response = await call(null, true);
    } catch (err) {
      // Some models don't accept a thinking level; try once without it.
      if (/thinking/i.test(String((err as Error)?.message))) response = await call(null, false);
      else throw err;
    }
    let parsed = parse(response.text);
    if (!parsed.success) {
      // One retry, telling the model what was wrong.
      response = await call(`Your previous answer did not match the schema (${String(parsed.error).slice(0, 300)}). Return only valid JSON for the schema.`, false);
      parsed = parse(response.text);
    }
    if (!parsed.success) throw new ExtractionError("The AI's answer couldn't be understood. Press Retry.");
    if (parsed.data.lineItems.length === 0) {
      throw new ExtractionError("No product lines were found. Make sure the photo shows the item table, then Retry.");
    }
    return { extraction: parsed.data, model, mock: false };
  } catch (err) {
    if (err instanceof ExtractionError) throw err;
    console.error("Gemini extraction failed", err);
    throw new ExtractionError(friendlyError(err));
  }
}
