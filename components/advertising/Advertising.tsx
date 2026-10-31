import { Atlas } from '@/constants/atlas';
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Keyboard,
  Linking,
  Modal,
  Pressable,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { apiFetch } from "@/store/api";
import { useTimerContext } from "@/store/timer-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAdvertisingRecording } from "@/store/advertising-safety";
import { isOnlineMode } from "@/store/app-mode";
import { fontFamily, theme } from '@/constants/theme';
type Campaign = { title: string; body: string; url: string };
type Ads = { enabled: boolean; campaigns: Record<string, Campaign> };
let activityAt = 0;
export function advertisingActivity() {
  activityAt = Date.now();
}
function useAds() {
  const [data, setData] = useState<Ads | null>(null);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      apiFetch<Ads>("/advertising/")
        .then((v) => {
          if (alive) setData(v);
        })
        .catch(() => {
          if (alive) setData(null);
        });
      return () => {
        alive = false;
      };
    }, []),
  );
  return { data, setData };
}
function useSafety() {
  const { activeTimers, timersReady } = useTimerContext();
  const recording = useAdvertisingRecording();
  const focused = useIsFocused();
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener("keyboardDidShow", () => setKeyboard(true)),
      b = Keyboard.addListener("keyboardDidHide", () => setKeyboard(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return (
    focused &&
    !keyboard &&
    timersReady &&
    !recording &&
    activeTimers.length === 0 &&
    isOnlineMode()
  );
}
export function AdSlot({
  slot,
  hidden = false,
}: {
  slot: "M1" | "M2";
  hidden?: boolean;
}) {
  const { data } = useAds(),
    safe = useSafety(),
    dark = useColorScheme() === "dark",
    { height } = useWindowDimensions();
  const creative = data?.enabled ? data.campaigns[slot] : null;
  if (!creative || !safe || hidden) return null;
  return (
    <View
      accessibilityLabel="Реклама"
      style={{
        height: Math.min(slot === "M1" ? 100 : 50, height * 0.15),
        maxWidth: 320,
        alignSelf: "center",
        width: "100%",
        // DS v2: рекламний блок — нейтральна картка surface.card без рамки.
        backgroundColor: theme[dark ? "dark" : "light"].surface.card,
        borderRadius: Atlas.radius.large,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginVertical: 8,
        overflow: "hidden",
      }}
    >
      <Pressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL(creative.url).catch(() => {})}
      >
        <Text style={{ fontSize: 10, color: theme[dark ? "dark" : "light"].text.secondary }}>
          Реклама
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontFamily: fontFamily.bold, color: theme[dark ? "dark" : "light"].text.primary }}
        >
          {creative.title}
        </Text>
        {slot === "M1" && (
          <Text
            numberOfLines={2}
            style={{ fontSize: 12, color: theme[dark ? "dark" : "light"].text.secondary }}
          >
            {creative.body}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
export function AdvertisingSettings() {
  const { data, setData } = useAds(),
    dark = useColorScheme() === "dark";
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <View
      style={{
        padding: 20,
        marginVertical: 10,
        borderRadius: Atlas.radius.xlarge,
        backgroundColor: theme[dark ? "dark" : "light"].surface.card,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ color: theme[dark ? "dark" : "light"].text.primary, flex: 1 }}>
          Показувати рекламу
        </Text>
        <Switch
          accessibilityLabel="Показувати рекламу"
          value={data?.enabled ?? false}
          disabled={!data || busy}
          onValueChange={(enabled) => {
            setBusy(true);
            setError("");
            apiFetch("/advertising/", { method: "PATCH", body: { enabled } })
              .then(() => apiFetch<Ads>("/advertising/"))
              .then(setData)
              .catch(() => setError("Не вдалося зберегти налаштування"))
              .finally(() => setBusy(false));
          }}
        />
      </View>
      <Text style={{ fontSize: 12, color: theme[dark ? "dark" : "light"].text.secondary }}>
        Вимикає банери й спонсорські паузи на ваших пристроях у цьому workspace.
      </Text>
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: theme[dark ? "dark" : "light"].status.danger }}>
          {error}
        </Text>
      )}
    </View>
  );
}
export function SponsorPause() {
  const { data } = useAds(),
    safe = useSafety();
  const [creative, setCreative] = useState<Campaign | null>(null),
    [seconds, setSeconds] = useState(11);
  const attempted = useRef(false);
  useEffect(() => {
    if (!safe || !data?.enabled || !data.campaigns.P1 || attempted.current)
      return;
    let alive = true;
    const started = Date.now();
    const timer = setTimeout(() => {
      if (activityAt >= started || AppState.currentState !== "active") return;
      attempted.current = true;
      apiFetch<{ campaign: Campaign | null }>("/advertising/", {
        method: "POST",
      })
        .then((r) => {
          if (alive && activityAt < started) {
            setSeconds(11);
            setCreative(r.campaign);
          }
        })
        .catch(() => {});
    }, 1000);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [safe, data]);
  useEffect(() => {
    if (!creative) return;
    const timer = setInterval(() => {
      if (AppState.currentState === "active")
        setSeconds((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [creative]);
  return (
    <Modal
      visible={!!creative && safe && !!data?.enabled}
      transparent
      animationType="none"
      onRequestClose={() => {
        if (!seconds) setCreative(null);
      }}
    >
      <View
        style={{
          flex: 1,
          // DS v2: повноекранна пауза — темний canvas.
          backgroundColor: theme.dark.bg.canvas,
          padding: 28,
          justifyContent: "center",
        }}
      >
        <Text
          accessibilityRole="header"
          style={{ fontSize: 20, fontFamily: fontFamily.medium, color: theme.dark.text.primary, marginBottom: 20 }}
        >
          {seconds === 11 ? "Спонсорська пауза · 10 с" : "Спонсор"}
        </Text>
        {seconds < 11 && creative && (
          <>
            <Text style={{ color: theme.dark.text.primary, fontSize: 24, fontFamily: fontFamily.semibold }}>
              {creative.title}
            </Text>
            <Text style={{ color: theme.dark.text.secondary, fontFamily: fontFamily.regular, marginVertical: 16 }}>
              {creative.body}
            </Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(creative.url).catch(() => {})}
            >
              <Text style={{ color: theme.dark.accent.lavender, fontFamily: fontFamily.semibold, paddingVertical: 12 }}>
                Дізнатися більше
              </Text>
            </Pressable>
          </>
        )}
        <Pressable
          disabled={seconds > 0}
          accessibilityRole="button"
          accessibilityState={{ disabled: seconds > 0 }}
          onPress={() => setCreative(null)}
          style={{
            padding: 16,
            minHeight: 48,
            alignItems: "center",
            borderRadius: 999,
            backgroundColor: seconds ? theme.dark.state.disabledBg : theme.dark.action.primary,
          }}
        >
          <Text style={{ color: seconds ? theme.dark.text.secondary : theme.dark.text.onAction, fontFamily: fontFamily.semibold, fontVariant: ["tabular-nums"] }}>
            {seconds
              ? `Продовжити через ${Math.min(10, seconds)} с`
              : "Продовжити"}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}
