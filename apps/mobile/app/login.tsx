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
import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
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

    const { data: { user } } = await supabase.auth.getUser();
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.card}>
        <Text style={styles.title}>MaintenanceBuddy</Text>
        <Text style={styles.subtitle}>Technician Login</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? "Signing in..." : "Sign In"}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", backgroundColor: "#fafafa", padding: 24 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 24, borderWidth: 1, borderColor: "#e4e4e7" },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center", color: "#18181b" },
  subtitle: { fontSize: 14, color: "#71717a", textAlign: "center", marginBottom: 24, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#e4e4e7",
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  button: { backgroundColor: "#18181b", borderRadius: 8, padding: 16, marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center" },
});
