/** Block persisted Diary writes before a draft was hydrated under the same owner/date/meal key. */
export function canPersistDiaryDraftForHydratedOwner(
  activeStorageKey: string | null,
  hydratedStorageKey: string | null,
): activeStorageKey is string {
  return typeof activeStorageKey === "string"
    && activeStorageKey.length > 0
    && activeStorageKey === hydratedStorageKey;
}
