/**
 * BOB — Conector Google Gemini (free tier)
 *
 * Modelo: gemini-2.0-flash-exp
 * Free tier: 1500 req/dia · 15 RPM
 * Suporta JSON mode nativo via responseMimeType.
 *
 * Usado como fallback gratuito quando Claude/GPT falham ou não estão configurados.
 */

const GEMINI_MODEL = "gemini-2.0-flash-exp";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

export async function callGemini(
  prompt: string,
  opts: { jsonMode?: boolean; maxTokens?: number } = {}
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: opts.maxTokens ?? 1500,
          ...(opts.jsonMode ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });

    if (!res.ok) {
      console.warn(`[BOB/Gemini] HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      return null;
    }

    const data = (await res.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text ?? null;
  } catch (err) {
    console.warn("[BOB/Gemini] erro:", err);
    return null;
  }
}
