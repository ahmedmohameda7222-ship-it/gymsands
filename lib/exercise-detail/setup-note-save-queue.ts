export type SetupNoteQueueState = "saving" | "saved" | "failed";

/**
 * Drain serialized note writes until the persisted value equals the latest desired
 * value. A desired value may change while an older network request is in flight;
 * the older request always completes first and can never overwrite the later edit.
 */
export async function drainLatestSetupNoteValue(input: {
  getDesired: () => string;
  getPersisted: () => string;
  setPersisted: (value: string) => void;
  save: (value: string) => Promise<string>;
  onState?: (state: SetupNoteQueueState) => void;
}) {
  try {
    while (input.getPersisted() !== input.getDesired()) {
      const value = input.getDesired();
      input.onState?.("saving");
      const persisted = await input.save(value);
      input.setPersisted(persisted);
    }
    input.onState?.("saved");
    return true;
  } catch {
    input.onState?.("failed");
    return false;
  }
}
