export async function createCoachResponse(apiKey: string, prompt: string) {
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                "You are a warm fitness coach. Explain plans, summarize progress, and structure preferences. Do not prescribe injury treatment, override deterministic workout rules, or invent exercise safety guidance."
            }
          ]
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 700
        }
      })
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Gemini coach response failed.");
  return (data.candidates ?? [])
    .flatMap((candidate: any) => candidate.content?.parts ?? [])
    .map((part: any) => part.text)
    .filter(Boolean)
    .join("\n")
    .trim();
}
