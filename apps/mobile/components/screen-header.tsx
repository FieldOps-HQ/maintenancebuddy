import type { ReactNode } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors, radius, fonts } from "@/lib/theme";

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  large?: boolean;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: ReactNode;
  children?: ReactNode;
  /** Dark chrome matching web sidebar (default). Use light for dense form flows. */
  variant?: "dark" | "light";
};

export function ScreenHeader({
  title,
  subtitle,
  large = false,
  showBack = false,
  onBack,
  rightAction,
  children,
  variant = "dark",
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const dark = variant === "dark";

  return (
    <View
      style={[
        styles.container,
        dark ? styles.containerDark : styles.containerLight,
        { paddingTop: insets.top + 12 },
      ]}
    >
      <View style={styles.topRow}>
        {showBack ? (
          <TouchableOpacity
            style={[styles.backButton, dark ? styles.backButtonDark : styles.backButtonLight]}
            onPress={onBack ?? (() => router.back())}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={[styles.backIcon, dark ? styles.backIconDark : styles.backIconLight]}>
              ‹
            </Text>
          </TouchableOpacity>
        ) : null}

        <View style={[styles.titleBlock, !showBack && styles.titleBlockFlush]}>
          <Text
            style={[
              styles.title,
              dark ? styles.titleDark : styles.titleLight,
              large && styles.titleLarge,
            ]}
            numberOfLines={2}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, dark ? styles.subtitleDark : styles.subtitleLight]}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {rightAction ? <View style={styles.rightAction}>{rightAction}</View> : null}
      </View>

      {children ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  containerDark: {
    backgroundColor: colors.sidebar,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  containerLight: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  backButtonDark: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  backButtonLight: {
    backgroundColor: colors.slate100,
  },
  backIcon: {
    fontSize: 28,
    lineHeight: 30,
    fontWeight: "600",
    marginLeft: -2,
  },
  backIconDark: {
    color: "#5eead4",
  },
  backIconLight: {
    color: colors.primary,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  titleBlockFlush: {
    paddingLeft: 0,
  },
  title: {
    fontSize: 20,
    fontFamily: fonts.semibold,
    letterSpacing: -0.3,
  },
  titleDark: {
    color: colors.white,
  },
  titleLight: {
    color: colors.text,
  },
  titleLarge: {
    fontSize: 24,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: fonts.regular,
    marginTop: 4,
    lineHeight: 18,
  },
  subtitleDark: {
    color: colors.sidebarText,
  },
  subtitleLight: {
    color: colors.textSecondary,
  },
  rightAction: {
    marginTop: 2,
  },
  body: {
    marginTop: 12,
  },
});
