import type { ReactNode } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors } from "@/lib/theme";

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  large?: boolean;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: ReactNode;
  children?: ReactNode;
};

export function ScreenHeader({
  title,
  subtitle,
  large = false,
  showBack = false,
  onBack,
  rightAction,
  children,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.topRow}>
        {showBack ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack ?? (() => router.back())}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
        ) : null}

        <View style={[styles.titleBlock, !showBack && styles.titleBlockFlush]}>
          <Text style={[styles.title, large && styles.titleLarge]} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        {rightAction ? <View style={styles.rightAction}>{rightAction}</View> : null}
      </View>

      {children ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.slate100,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  backIcon: {
    fontSize: 28,
    lineHeight: 30,
    color: colors.primary,
    fontWeight: "600",
    marginLeft: -2,
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
    fontWeight: "700",
    color: colors.text,
  },
  titleLarge: {
    fontSize: 26,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },
  rightAction: {
    marginTop: 2,
  },
  body: {
    marginTop: 12,
  },
});
