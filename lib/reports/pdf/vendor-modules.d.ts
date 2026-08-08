declare module "bidi-js" {
  type BidiLevels = Readonly<{ levels: readonly number[] }>;
  type BidiApi = Readonly<{
    getEmbeddingLevels: (text: string, direction: "ltr" | "rtl") => BidiLevels;
    getReorderedIndices: (text: string, levels: BidiLevels) => readonly number[];
    getMirroredCharactersMap: (
      text: string,
      levels: BidiLevels,
    ) => ReadonlyMap<number, string>;
  }>;
  const bidiFactory: () => BidiApi;
  export default bidiFactory;
}
