/** Matches web app Tailwind tokens (sky primary, slate neutrals). */
export const colors = {
  background: "#fafafa",
  surface: "#ffffff",
  border: "#e2e8f0",
  borderLight: "#f1f5f9",
  text: "#0f172a",
  textSecondary: "#64748b",
  textMuted: "#71717a",
  primary: "#0284c7",
  primaryDark: "#0369a1",
  primaryLight: "#e0f2fe",
  primaryBorder: "#7dd3fc",
  primaryRing: "#bae6fd",
  success: "#22c55e",
  successDark: "#16a34a",
  warning: "#eab308",
  danger: "#ef4444",
  slate100: "#f1f5f9",
  slate700: "#334155",
  amber50: "#fffbeb",
  amber800: "#92400e",
  white: "#ffffff",
  overlay: "rgba(0,0,0,0.5)",
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;
