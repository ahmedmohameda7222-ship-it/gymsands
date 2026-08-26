export type CookingVoiceCommand =
  | "next"
  | "back"
  | "repeat"
  | "start_timer"
  | "pause_timer"
  | "resume"
  | "whats_next";

export type CookingVoiceParseResult =
  | { kind: "command"; command: CookingVoiceCommand }
  | { kind: "unknown"; raw: string };

const COMMANDS: Readonly<Record<string, CookingVoiceCommand>> = {
  next: "next",
  back: "back",
  repeat: "repeat",
  "start timer": "start_timer",
  "pause timer": "pause_timer",
  resume: "resume",
  "what's next": "whats_next",
};

function normalizeCookingVoice(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("’", "'")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
}

export function parseCookingVoiceCommand(raw: string): CookingVoiceParseResult {
  const normalized = normalizeCookingVoice(raw);
  const command = COMMANDS[normalized];
  return command
    ? { kind: "command", command }
    : { kind: "unknown", raw };
}
