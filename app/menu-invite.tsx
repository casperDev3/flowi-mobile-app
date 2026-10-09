import React, { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/store/auth";
import { menuApi } from "@/store/menu-api";
import {
  buildWorkspaceConfig,
  cachedWorkspaceConfig,
  checkWorkspace,
  normalizeWorkspaceOrigin,
  setWorkspaceConfig,
} from "@/store/workspace";
import { saveData } from "@/store/storage";
import { ContentContainer } from "@/components/shared/ContentContainer";
import { ScreenHeader } from "@/components/shared/ScreenHeader";
import { menuBits } from "@/components/menu/MenuBits";
import { MENU_ERR, useMenuColors } from "@/components/menu/theme";
import { useI18n } from "@/store/i18n";
export default function MenuInviteScreen() {
  const { ws, t } = useLocalSearchParams<{ ws?: string; t?: string }>();
  const { status, switchWorkspace } = useAuth();
  const router = useRouter(),
    c = useMenuColors(),
    { tr } = useI18n();
  const [name, setName] = useState(""),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  const normalized = normalizeWorkspaceOrigin(ws ?? "");
  const same =
    normalized.ok && cachedWorkspaceConfig()?.origin === normalized.origin;
  useEffect(() => {
    let alive = true;
    if (same && t)
      menuApi
        .preview(t)
        .then((p) => {
          if (alive) {
            setName(p.name);
            setReady(true);
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [same, t, status]);
  async function connect() {
    setBusy(true);
    setError("");
    try {
      if (!ws || !t) throw new Error("Посилання недійсне");
      const check = await checkWorkspace(ws);
      if (!check.ok) throw new Error("Не вдалося відкрити workspace");
      if (status === "authed") await switchWorkspace(false, check.origin);
      await setWorkspaceConfig(buildWorkspaceConfig(check.origin, check.info));
      const p = await menuApi.preview(t);
      setName(p.name);
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка запрошення");
    } finally {
      setBusy(false);
    }
  }
  async function join() {
    setBusy(true);
    try {
      const s = await menuApi.accept(t ?? "");
      await saveData("pending_menu_invite", null);
      router.replace({ pathname: "/menu", params: { space: s.id } } as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка запрошення");
    } finally {
      setBusy(false);
    }
  }
  async function login(register = false) {
    if (!normalized.ok || !t) return;
    await saveData("pending_menu_invite", { ws: normalized.origin, t });
    router.push(register ? "/register" : "/login");
  }
  // Той самий вигляд, що й екран меню: ScreenHeader, фон і картки модуля.
  const { btn, panel } = menuBits(c, busy);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <ScreenHeader
        title="Запрошення до меню"
        color={c.text}
        back={{
          onPress: () => (router.canGoBack() ? router.back() : router.replace("/")),
          label: tr.back,
          style: { backgroundColor: c.dim, borderColor: c.border },
        }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 100 }}>
        <ContentContainer variant="reading" style={{ paddingTop: 6 }}>
          {panel(
            <>
              {!!error && (
                <Text accessibilityRole="alert" style={{ color: MENU_ERR }}>
                  {error}
                </Text>
              )}
              {!ready ? (
                <>
                  <Text style={{ color: c.text, fontSize: 15, lineHeight: 22 }}>
                    Відкрити workspace {ws}?{" "}
                    {status === "authed"
                      ? "Перехід до іншого workspace потребує виходу з поточного акаунта."
                      : ""}
                  </Text>
                  {btn("Продовжити", () => void connect(), true)}
                </>
              ) : (
                <>
                  <Text style={{ color: c.text, fontSize: 20, fontWeight: "700" }}>{name}</Text>
                  <Text style={{ color: c.sub, fontSize: 15, lineHeight: 22 }}>
                    Переглядайте меню та надсилайте пропозиції або скарги автору.
                  </Text>
                  {status === "authed" ? (
                    btn("Приєднатися", () => void join(), true)
                  ) : (
                    <>
                      {btn("Увійти", () => void login(), true)}
                      {btn("Створити акаунт", () => void login(true))}
                    </>
                  )}
                </>
              )}
            </>,
          )}
        </ContentContainer>
      </ScrollView>
    </View>
  );
}
