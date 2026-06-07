export async function createCoachResponse(apiKey: string, prompt: string) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      instructions:
        "You are a warm fitness coach. Explain plans, summarize progress, and structure preferences. Do not prescribe injury treatment, override deterministic workout rules, or invent exercise safety guidance.",
      input: prompt,
      max_output_tokens: 700
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "OpenAI coach response failed.");
  return data.output_text ?? data.output?.flatMap((item: any) => item.content ?? []).map((part: any) => part.text).filter(Boolean).join("\n") ?? "";
}
