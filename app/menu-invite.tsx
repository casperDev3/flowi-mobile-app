import React, { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "react-native";
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
import { GroupScreenShell } from "@/components/training/GroupScreenShell";
import { Card, PrimaryButton } from "@/components/training/TrainingBits";
import { useTrainingColors } from "@/components/training/theme";
export default function MenuInviteScreen() {
  const { ws, t } = useLocalSearchParams<{ ws?: string; t?: string }>();
  const { status, switchWorkspace } = useAuth();
  const router = useRouter(),
    c = useTrainingColors();
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
  return (
    <GroupScreenShell c={c} title="Запрошення до меню">
      <Card c={c}>
        {!!error && (
          <Text accessibilityRole="alert" style={{ color: "#EF4444" }}>
            {error}
          </Text>
        )}
        {!ready ? (
          <>
            <Text style={{ color: c.text }}>
              Відкрити workspace {ws}?{" "}
              {status === "authed"
                ? "Перехід до іншого workspace потребує виходу з поточного акаунта."
                : ""}
            </Text>
            <PrimaryButton
              label="Продовжити"
              disabled={busy}
              onPress={() => void connect()}
            />
          </>
        ) : (
          <>
            <Text style={{ color: c.text, fontSize: 20, fontWeight: "700" }}>
              {name}
            </Text>
            <Text style={{ color: c.sub, marginVertical: 12 }}>
              Переглядайте меню та надсилайте пропозиції або скарги автору.
            </Text>
            {status === "authed" ? (
              <PrimaryButton
                label="Приєднатися"
                disabled={busy}
                onPress={() => void join()}
              />
            ) : (
              <>
                <PrimaryButton label="Увійти" onPress={() => void login()} />
                <PrimaryButton
                  label="Створити акаунт"
                  onPress={() => void login(true)}
                />
              </>
            )}
          </>
        )}
      </Card>
    </GroupScreenShell>
  );
}
