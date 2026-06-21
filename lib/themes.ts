export const themeIds = [
  "olive",
  "elite-noir",
  "emerald-pulse",
  "arctic-platinum",
  "velocity-ember",
  "obsidian-sapphire",
  "graphite-lime",
  "cocoa-copper",
  "ivory-rosewood",
  "navy-sovereign",
  "bordeaux-royale",
  "emerald-executive",
  "platinum-graphite"
] as const;

export type ThemeId = (typeof themeIds)[number];

export type AppTheme = {
  id: ThemeId;
  name: string;
  description: string;
  palette: string[];
  appBackground: string;
  surface: string;
  surfaceElevated: string;
  primary: string;
  primarySoft: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  buttonText: string;
  success: string;
  danger: string;
  warning: string;
};

export const defaultThemeId: ThemeId = "olive";

export const appThemes: AppTheme[] = [
  {
    id: "olive",
    name: "Olive Default",
    description: "The original FitLife olive theme with warm surfaces and calm contrast.",
    palette: ["#F8F6F1", "#FFFFFF", "#2D3A1E", "#C49A3B", "#3A7D44"],
    appBackground: "#F8F6F1",
    surface: "#FFFFFF",
    surfaceElevated: "#FDFCFA",
    primary: "#2D3A1E",
    primarySoft: "#E8EDE0",
    textPrimary: "#1A1A1A",
    textSecondary: "#6B6B6B",
    border: "#E8E5DF",
    buttonText: "#FFFFFF",
    success: "#3A7D44",
    danger: "#9E2B2B",
    warning: "#B85C00"
  },
  {
    id: "elite-noir",
    name: "Elite Noir",
    description: "Deep black surfaces, champagne highlights, and crisp training-room contrast.",
    palette: ["#08090B", "#14161A", "#D8B75E", "#F5EFE0", "#7D8490"],
    appBackground: "#08090B",
    surface: "#111318",
    surfaceElevated: "#1A1D23",
    primary: "#D8B75E",
    primarySoft: "#332B17",
    textPrimary: "#F7F3EA",
    textSecondary: "#B7B0A3",
    border: "#2B3038",
    buttonText: "#111318",
    success: "#61B67A",
    danger: "#F06A6A",
    warning: "#E2A93B"
  },
  {
    id: "emerald-pulse",
    name: "Emerald Pulse",
    description: "Energetic emerald accents on a clean performance-focused canvas.",
    palette: ["#EFFAF4", "#FFFFFF", "#067A46", "#9DE0B8", "#253D32"],
    appBackground: "#EFFAF4",
    surface: "#FFFFFF",
    surfaceElevated: "#F7FEFA",
    primary: "#067A46",
    primarySoft: "#D7F4E3",
    textPrimary: "#17251F",
    textSecondary: "#587165",
    border: "#D4EADD",
    buttonText: "#FFFFFF",
    success: "#168A4F",
    danger: "#B33145",
    warning: "#B76B00"
  },
  {
    id: "arctic-platinum",
    name: "Arctic Platinum",
    description: "Cool platinum whites, blue-gray lines, and a polished minimal feel.",
    palette: ["#F4F8FB", "#FFFFFF", "#315D7C", "#BFD4E2", "#1C2833"],
    appBackground: "#F4F8FB",
    surface: "#FFFFFF",
    surfaceElevated: "#F9FCFE",
    primary: "#315D7C",
    primarySoft: "#DDEAF2",
    textPrimary: "#18232E",
    textSecondary: "#617180",
    border: "#DDE6ED",
    buttonText: "#FFFFFF",
    success: "#2F7D67",
    danger: "#A83B4D",
    warning: "#A86813"
  },
  {
    id: "velocity-ember",
    name: "Velocity Ember",
    description: "Fast, warm ember accents balanced by graphite surfaces.",
    palette: ["#171412", "#24201D", "#F26B3A", "#FFC19D", "#F4EFE8"],
    appBackground: "#171412",
    surface: "#211D1A",
    surfaceElevated: "#2C2723",
    primary: "#F26B3A",
    primarySoft: "#4A2118",
    textPrimary: "#FBF4EC",
    textSecondary: "#C7B7AA",
    border: "#3A332E",
    buttonText: "#1A120E",
    success: "#72B77B",
    danger: "#FF7771",
    warning: "#F4B04D"
  },
  {
    id: "obsidian-sapphire",
    name: "Obsidian Sapphire",
    description: "Dark obsidian depth with sapphire blue action states.",
    palette: ["#0B1020", "#151B2E", "#4C8DFF", "#A8C8FF", "#EAF1FF"],
    appBackground: "#0B1020",
    surface: "#12192B",
    surfaceElevated: "#1A2440",
    primary: "#4C8DFF",
    primarySoft: "#162A54",
    textPrimary: "#EFF5FF",
    textSecondary: "#B5C1D6",
    border: "#2A3653",
    buttonText: "#FFFFFF",
    success: "#61C790",
    danger: "#FF6B7A",
    warning: "#F2C14E"
  },
  {
    id: "graphite-lime",
    name: "Graphite Lime",
    description: "Graphite structure with sharp lime energy for active workflows.",
    palette: ["#F3F5F2", "#FFFFFF", "#304027", "#9BC53D", "#1A1F18"],
    appBackground: "#F3F5F2",
    surface: "#FFFFFF",
    surfaceElevated: "#FAFBF8",
    primary: "#304027",
    primarySoft: "#E6F2D0",
    textPrimary: "#1A1F18",
    textSecondary: "#626B5B",
    border: "#DDE4D7",
    buttonText: "#FFFFFF",
    success: "#4D8B31",
    danger: "#A93333",
    warning: "#A97900"
  },
  {
    id: "cocoa-copper",
    name: "Cocoa Copper",
    description: "Rich cocoa tones with copper accents and comfortable warmth.",
    palette: ["#FBF6F0", "#FFFFFF", "#5A3928", "#B86E3B", "#2B1C16"],
    appBackground: "#FBF6F0",
    surface: "#FFFFFF",
    surfaceElevated: "#FFF9F4",
    primary: "#5A3928",
    primarySoft: "#F0DED1",
    textPrimary: "#2B1C16",
    textSecondary: "#78645A",
    border: "#E9DCD2",
    buttonText: "#FFFFFF",
    success: "#4B8B58",
    danger: "#A5403E",
    warning: "#B86E3B"
  },
  {
    id: "ivory-rosewood",
    name: "Ivory Rosewood",
    description: "Soft ivory surfaces with refined rosewood accents.",
    palette: ["#FCF8F5", "#FFFFFF", "#74414A", "#D6A5AE", "#2D1E22"],
    appBackground: "#FCF8F5",
    surface: "#FFFFFF",
    surfaceElevated: "#FFFDFC",
    primary: "#74414A",
    primarySoft: "#F2DDE1",
    textPrimary: "#2D1E22",
    textSecondary: "#765F64",
    border: "#EBDDE0",
    buttonText: "#FFFFFF",
    success: "#477F61",
    danger: "#A5364E",
    warning: "#B8792B"
  },
  {
    id: "navy-sovereign",
    name: "Navy Sovereign",
    description: "Authoritative navy with bright porcelain surfaces and gold cues.",
    palette: ["#F2F5FA", "#FFFFFF", "#122A46", "#C8A24A", "#51657D"],
    appBackground: "#F2F5FA",
    surface: "#FFFFFF",
    surfaceElevated: "#F8FAFD",
    primary: "#122A46",
    primarySoft: "#DCE6F2",
    textPrimary: "#142236",
    textSecondary: "#607087",
    border: "#DBE4EF",
    buttonText: "#FFFFFF",
    success: "#2F7D67",
    danger: "#A93448",
    warning: "#A87812"
  },
  {
    id: "bordeaux-royale",
    name: "Bordeaux Royale",
    description: "Bordeaux richness with cream surfaces and stately contrast.",
    palette: ["#FAF4F3", "#FFFFFF", "#621D34", "#C9A45A", "#30131E"],
    appBackground: "#FAF4F3",
    surface: "#FFFFFF",
    surfaceElevated: "#FFF9F7",
    primary: "#621D34",
    primarySoft: "#F0D9E0",
    textPrimary: "#30131E",
    textSecondary: "#735D66",
    border: "#EAD9DE",
    buttonText: "#FFFFFF",
    success: "#4C8260",
    danger: "#B23645",
    warning: "#B77A1B"
  },
  {
    id: "emerald-executive",
    name: "Emerald Executive",
    description: "Executive dark emerald with restrained gold and soft ivory text.",
    palette: ["#0D1814", "#16231E", "#3FBF84", "#D6B65D", "#F2F2E8"],
    appBackground: "#0D1814",
    surface: "#14211C",
    surfaceElevated: "#1C2B25",
    primary: "#3FBF84",
    primarySoft: "#173928",
    textPrimary: "#F2F2E8",
    textSecondary: "#B9C3B8",
    border: "#2B4138",
    buttonText: "#08120E",
    success: "#60CA8A",
    danger: "#F06A73",
    warning: "#D6B65D"
  },
  {
    id: "platinum-graphite",
    name: "Platinum Graphite",
    description: "Crisp platinum styling with graphite typography and cool accents.",
    palette: ["#F7F7F5", "#FFFFFF", "#343A40", "#8E9AAF", "#111417"],
    appBackground: "#F7F7F5",
    surface: "#FFFFFF",
    surfaceElevated: "#FBFBFA",
    primary: "#343A40",
    primarySoft: "#E5E8EC",
    textPrimary: "#111417",
    textSecondary: "#626A72",
    border: "#E0E2E2",
    buttonText: "#FFFFFF",
    success: "#3F8065",
    danger: "#A63D4A",
    warning: "#A87717"
  }
];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && themeIds.includes(value as ThemeId);
}

export function getThemeById(themeId: unknown): AppTheme {
  return appThemes.find((theme) => theme.id === themeId) ?? appThemes[0];
}

export function hexToHslParts(hex: string) {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function isDarkTheme(theme: AppTheme) {
  const normalized = theme.appBackground.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.45;
}
