import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { colors, radius, fonts } from "@/lib/theme";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      Alert.alert("Login failed", error.message);
      setLoading(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert("Login failed", "Session was not established. Try again.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      Alert.alert("Access denied", "Profile not found.");
      setLoading(false);
      return;
    }

    if (profile.role !== "technician") {
      await supabase.auth.signOut();
      Alert.alert("Access denied", "This app is for technicians only.");
      setLoading(false);
      return;
    }

    router.replace("/(main)");
    setLoading(false);
  }

  return (
    <View style={styles.root}>
      <View style={[styles.hero, { paddingTop: insets.top + 32 }]}>
        <View style={styles.mark}>
          <Text style={styles.markGlyph}>⚙</Text>
        </View>
        <Text style={styles.brand}>MaintenanceBuddy</Text>
        <Text style={styles.heroEyebrow}>FIELD OPERATIONS</Text>
        <Text style={styles.heroTitle}>Track suite visits on site</Text>
        <Text style={styles.heroSub}>
          Complete units, capture photos, and sync when you're back online.
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.formWrap}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Text style={styles.formTitle}>Technician sign in</Text>
        <Text style={styles.formHint}>Use the account your admin invited</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? "Signing in..." : "Sign in"}</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hero: {
    backgroundColor: colors.sidebar,
    paddingHorizontal: 24,
    paddingBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  mark: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  markGlyph: { color: colors.white, fontSize: 18 },
  brand: {
    color: colors.white,
    fontSize: 18,
    fontFamily: fonts.semibold,
    letterSpacing: -0.2,
  },
  heroEyebrow: {
    marginTop: 20,
    color: "#5eead4",
    fontSize: 11,
    fontFamily: fonts.semibold,
    letterSpacing: 1.6,
  },
  heroTitle: {
    marginTop: 8,
    color: colors.white,
    fontSize: 26,
    fontFamily: fonts.semibold,
    letterSpacing: -0.4,
    lineHeight: 32,
  },
  heroSub: {
    marginTop: 8,
    color: colors.sidebarText,
    fontSize: 14,
    fontFamily: fonts.regular,
    lineHeight: 20,
    maxWidth: 320,
  },
  formWrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  formTitle: {
    fontSize: 20,
    fontFamily: fonts.semibold,
    color: colors.text,
    letterSpacing: -0.2,
  },
  formHint: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: fonts.regular,
    marginBottom: 12,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontFamily: fonts.semibold,
    textAlign: "center",
  },
});
