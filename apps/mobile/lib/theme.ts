/** Matches web app tokens (teal primary, zinc neutrals, amber accent). */
export const colors = {
  background: "#f4f4f5",
  surface: "#ffffff",
  border: "#e4e4e7",
  borderLight: "#f4f4f5",
  text: "#18181b",
  textSecondary: "#71717a",
  textMuted: "#a1a1aa",
  primary: "#0f766e",
  primaryDark: "#115e59",
  primaryLight: "#ccfbf1",
  primaryBorder: "#5eead4",
  primaryRing: "#99f6e4",
  accent: "#d97706",
  accentLight: "#fffbeb",
  accentDark: "#92400e",
  success: "#059669",
  successDark: "#047857",
  warning: "#d97706",
  danger: "#dc2626",
  slate100: "#f4f4f5",
  slate700: "#3f3f46",
  amber50: "#fffbeb",
  amber800: "#92400e",
  sidebar: "#18181b",
  sidebarText: "#a1a1aa",
  white: "#ffffff",
  overlay: "rgba(0,0,0,0.55)",
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
} as const;

/** Loaded in app/_layout via @expo-google-fonts/dm-sans */
export const fonts = {
  regular: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  semibold: "DMSans_600SemiBold",
  bold: "DMSans_700Bold",
} as const;
