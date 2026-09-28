import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
  Stack,
} from "expo-router";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useAuth } from "@/store/auth";
import {
  useTrainingColors,
  TG_ACCENT,
  TG_OK,
  TG_WARN,
} from "@/components/training/theme";
import { IconSymbol, type IconSymbolName } from "@/components/ui/icon-symbol";
import { FormField } from "@/components/shared/FormField";
import {
  menuApi,
  menuError,
  meals,
  feedbackStatus,
  weekDays,
  addDays,
  type Meal,
  type MenuSpace,
  type MenuDetail,
  type MenuEntry,
  type MenuFeedback,
} from "@/store/menu-api";

type Editor = {
  kind:
    | "dish"
    | "proposal"
    | "complaint"
    | "review"
    | "create"
    | "join"
    | "invite"
    | "settings";
  entry?: MenuEntry;
  item?: MenuFeedback;
  date?: string;
  meal?: Meal;
};
const dateLabel = (d: string) =>
  new Date(d + "T12:00").toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
  });
const confirm = (text: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(
      "Підтвердження",
      text,
      [
        { text: "Скасувати", style: "cancel", onPress: () => resolve(false) },
        { text: "Підтвердити", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
const errorText = menuError;
// Фіксований порядок прийомів їжі та їхні іконки/кольори — однакові з вебом.
const MEAL_ORDER: Meal[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_META: Record<Meal, { icon: IconSymbolName; color: string }> = {
  breakfast: { icon: "sun.horizon.fill", color: "#F59E0B" },
  lunch: { icon: "sun.max.fill", color: "#0EA5E9" },
  dinner: { icon: "moon.fill", color: "#6366F1" },
  snack: { icon: "leaf.fill", color: "#10B981" },
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const weekdayLabel = (d: string, weekday: "short" | "long") =>
  new Date(d + "T12:00").toLocaleDateString("uk-UA", { weekday });
export default function WeeklyMenu() {
  const c = useTrainingColors(),
    { user } = useAuth(),
    router = useRouter(),
    params = useLocalSearchParams<{ space?: string }>(),
    // Стартова ширина з вікна, щоб планшет/веб не блимав телефонною розкладкою до onLayout.
    win = useWindowDimensions();
  const [width, setWidth] = useState(() => Math.min(win.width, 1280) - 32),
    [spaces, setSpaces] = useState<MenuSpace[]>([]),
    [id, setId] = useState(params.space || ""),
    [week, setWeek] = useState(""),
    [menu, setMenu] = useState<MenuDetail | null>(null),
    [day, setDay] = useState("");
  const [tab, setTab] = useState("menu"),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [showArchive, setShowArchive] = useState(false);
  const [filter, setFilter] = useState("proposal"),
    [history, setHistory] = useState(false),
    [editor, setEditor] = useState<Editor | null>(null),
    [dirty, setDirty] = useState(false),
    [formError, setFormError] = useState("");
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [date, setDate] = useState(""),
    [meal, setMeal] = useState<Meal>("lunch"),
    [free, setFree] = useState(true),
    [photo, setPhoto] = useState<string | undefined>(),
    [photoBusy, setPhotoBusy] = useState(false),
    [copyId, setCopyId] = useState<number | undefined>();
  const [query, setQuery] = useState(""),
    [library, setLibrary] = useState<MenuEntry[]>([]),
    [response, setResponse] = useState(""),
    [decision, setDecision] = useState("approved"),
    [replaceId, setReplaceId] = useState<number | undefined>(),
    [zone, setZone] = useState("Europe/Kyiv"),
    [selectedMeals, setSelectedMeals] = useState<Meal[]>([
      "breakfast",
      "lunch",
      "dinner",
      "snack",
    ]);
  const [slotMenu, setSlotMenu] = useState<MenuDetail | null>(null);
  // Власник явно вмикає редагування затвердженого тижня; інакше — лише перегляд.
  const [editApproved, setEditApproved] = useState(false);
  // Мініатюри фото страв (лише для обраного дня на телефоні), кеш за версією страви.
  const thumbs = useRef(new Map<string, string | null>()),
    [, setThumbTick] = useState(0);
  const generation = useRef(0),
    editorGeneration = useRef(0),
    working = useRef(false),
    lastParam = useRef(params.space);
  const refresh = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const r = await menuApi.list();
      const selected =
        (id && r.results.some((x) => x.id === id)
          ? id
          : r.results.find((x) => !x.archived)?.id || r.results[0]?.id) || "";
      const detail = selected ? await menuApi.get(selected, week) : null;
      if (ticket !== generation.current) return;
      setSpaces(r.results);
      setMenu(detail);
      if (id !== selected) setId(selected);
      if (detail)
        setDay((old) =>
          weekDays(detail.week).includes(old)
            ? old
            : weekDays(detail.week).includes(detail.today)
              ? detail.today
              : detail.week,
        );
    } catch (e) {
      if (ticket === generation.current) setError(errorText(e));
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }, [id, week]);
  useFocusEffect(
    useCallback(() => {
      if (params.space !== lastParam.current) {
        lastParam.current = params.space;
        if (params.space) {
          setId(params.space);
          setWeek("");
        }
      }
      void refresh();
      return () => {
        generation.current++;
      };
    }, [refresh, params.space]),
  );
  const current = menu ? weekDays(menu.today)[0] : "",
    next = current ? addDays(current, 7) : "",
    days = menu ? weekDays(menu.week) : [],
    layout: "phone" | "tablet" | "desktop" =
      width < 768 ? "phone" : width < 1200 ? "tablet" : "desktop";
  const editable =
      !!menu && !menu.archived && [current, next].includes(menu.week),
    canEdit = editable && !!menu?.is_owner;
  const approved = !!menu?.published_at,
    // Затверджений тиждень — чистий розклад без закликів «додати».
    showAdd = canEdit && (!approved || editApproved),
    readOnly = !canEdit || (approved && !editApproved),
    orderedMeals = menu
      ? MEAL_ORDER.filter((m) => menu.week_meals.includes(m))
      : [];
  useEffect(() => {
    setEditApproved(false);
  }, [id, menu?.week]);
  useEffect(() => {
    if (!menu || !id || layout !== "phone") return;
    let alive = true;
    for (const e of menu.entries) {
      if (e.date !== day || !e.has_photo) continue;
      const key = `${id}:${e.id}:${e.updated_at}`;
      if (thumbs.current.has(key)) continue;
      thumbs.current.set(key, null);
      void menuApi
        .photo(id, e.id)
        .then((r) => {
          thumbs.current.set(key, r.photo || null);
          if (alive) setThumbTick((t) => t + 1);
        })
        .catch(() => {
          // Без мініатюри лишається значок камери.
        });
    }
    return () => {
      alive = false;
    };
  }, [menu, id, day, layout]);
  const pending = menu?.feedback.filter((x) => x.status === "pending") || [],
    pendingWeek = pending.filter(
      (x) => x.kind === "proposal" && x.week === menu?.week,
    ).length;
  const proposalsOpen =
    !!menu && !menu.archived && !(menu.week === next && menu.published_at);
  const run = async (
    fn: () => Promise<unknown>,
    note = "Збережено",
    closeForm = true,
  ) => {
    if (working.current || loading) return;
    const viewGeneration = generation.current;
    working.current = true;
    setBusy(true);
    setError("");
    setFormError("");
    try {
      await fn();
      if (closeForm) {
        setEditor(null);
        setDirty(false);
        editorGeneration.current++;
      }
      setMessage(note);
      if (viewGeneration === generation.current) await refresh();
    } catch (e) {
      if (editor) setFormError(errorText(e));
      else setError(errorText(e));
    } finally {
      setBusy(false);
      working.current = false;
    }
  };
  const close = async () => {
    if (busy || photoBusy) return;
    if (dirty && !(await confirm("Відкинути незбережені зміни?"))) return;
    editorGeneration.current++;
    setEditor(null);
    setDirty(false);
  };
  function open(value: Editor) {
    if (busy || loading) return;
    const ticket = ++editorGeneration.current;
    setEditor(value);
    setDirty(false);
    setFormError("");
    setPhoto(undefined);
    setPhotoBusy(false);
    setQuery("");
    setLibrary([]);
    setCopyId(undefined);
    setResponse("");
    setReplaceId(undefined);
    setDecision(value.item?.kind === "complaint" ? "resolved" : "approved");
    setTitle(
      value.kind === "settings"
        ? menu?.name || ""
        : value.entry?.title || value.item?.text || "",
    );
    setDescription(value.entry?.description || value.item?.description || "");
    const d =
      value.date ||
      value.entry?.date ||
      value.item?.date ||
      value.item?.week ||
      next;
    setDate(d);
    setMeal(
      value.meal ||
        value.entry?.meal ||
        value.item?.meal ||
        menu?.week_meals[0] ||
        "lunch",
    );
    setFree(!value.item?.date && !value.date);
    setZone(menu?.timezone || "Europe/Kyiv");
    setSelectedMeals(menu?.meals || ["breakfast", "lunch", "dinner", "snack"]);
    setSlotMenu(menu);
    if (id && d && (!menu || weekDays(d)[0] !== menu.week))
      void menuApi
        .get(id, d)
        .then((r) => {
          if (ticket === editorGeneration.current) {
            setSlotMenu(r);
            setMeal((m) => (r.week_meals.includes(m) ? m : r.week_meals[0]));
          }
        })
        .catch((e) => {
          if (ticket === editorGeneration.current) setFormError(errorText(e));
        });
    if (value.entry?.has_photo || value.item?.has_photo) {
      setPhotoBusy(true);
      void menuApi
        .photo(id, value.entry?.id || value.item!.id, !!value.item)
        .then((r) => {
          if (ticket === editorGeneration.current) setPhoto(r.photo);
        })
        .catch((e) => {
          if (ticket === editorGeneration.current) setFormError(errorText(e));
        })
        .finally(() => {
          if (ticket === editorGeneration.current) setPhotoBusy(false);
        });
    }
  }
  async function choosePhoto(camera = false) {
    const ticket = editorGeneration.current;
    setPhotoBusy(true);
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted)
          throw new Error("Дозвольте доступ до камери в налаштуваннях.");
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.8,
          });
      if (result.canceled) return;
      const asset = result.assets[0];
      const converted = await ImageManipulator.manipulateAsync(
        asset.uri,
        [
          {
            resize:
              asset.width > asset.height
                ? { width: Math.min(asset.width, 1280) }
                : { height: Math.min(asset.height, 1280) },
          },
        ],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );
      if (ticket === editorGeneration.current) {
        setPhoto("data:image/jpeg;base64," + converted.base64);
        setDirty(true);
      }
    } catch (e) {
      setFormError(errorText(e));
    } finally {
      if (ticket === editorGeneration.current) setPhotoBusy(false);
    }
  }
  async function copyDish(entry: MenuEntry) {
    const ticket = editorGeneration.current;
    setTitle(entry.title);
    setDescription(entry.description);
    setCopyId(entry.id);
    setPhoto(undefined);
    setQuery("");
    setLibrary([]);
    setDirty(true);
    if (entry.has_photo) {
      setPhotoBusy(true);
      try {
        const result = await menuApi.photo(id, entry.id);
        if (ticket === editorGeneration.current) setPhoto(result.photo);
      } catch (e) {
        if (ticket === editorGeneration.current) setFormError(menuError(e));
      } finally {
        if (ticket === editorGeneration.current) setPhotoBusy(false);
      }
    }
  }
  async function submit() {
    if (!editor) return;
    if (
      ["create", "dish", "proposal", "complaint"].includes(editor.kind) &&
      !title.trim()
    ) {
      setFormError("Заповніть обов’язкове поле.");
      return;
    }
    if (editor.kind === "create") {
      if (!selectedMeals.length) {
        setFormError("Оберіть прийоми їжі.");
        return;
      }
      await run(async () => {
        const r = await menuApi.create(title.trim(), {
          timezone: zone,
          meals: selectedMeals,
        });
        setId(r.id);
        setWeek("");
      }, "Групу створено");
      return;
    }
    if (editor.kind === "join") {
      try {
        const url = new URL(title);
        if (
          !["http:", "https:", "ftrackingapp:"].includes(url.protocol) ||
          !url.searchParams.get("t")
        )
          throw new Error();
        router.push({
          pathname: "/menu-invite",
          params: {
            t: url.searchParams.get("t")!,
            ws: url.searchParams.get("ws") || "",
          },
        });
        setEditor(null);
      } catch {
        setFormError("Вставте посилання запрошення Flowi.");
      }
      return;
    }
    if (!menu) return;
    if (editor.kind === "settings") {
      await run(() =>
        menuApi.settings(id, {
          name: title,
          timezone: zone,
          meals: selectedMeals,
        }),
      );
      return;
    }
    if (editor.kind === "invite") {
      await run(async () => {
        const r = await menuApi.invite(id, title.trim());
        if (r.url) await Share.share({ message: r.url });
        if (r.email_sent === false)
          Alert.alert(
            "Лист не надіслано",
            "Учасника додано або запрошення створено, але поштовий сервер не підтвердив надсилання.",
          );
      }, "Запрошення створено");
      return;
    }
    if (editor.kind === "dish") {
      if (
        menu.published_at &&
        !(await confirm("Змінити затверджене меню й повідомити учасників?"))
      )
        return;
      await run(() =>
        menuApi.save(
          id,
          {
            date,
            meal,
            title: title.trim(),
            description,
            photo,
            copy_id: copyId,
            version: editor.entry?.updated_at,
            confirm: !!menu.published_at,
          },
          editor.entry?.id,
        ),
      );
      return;
    }
    if (editor.kind === "complaint") {
      await run(
        () =>
          menuApi.feedback(id, {
            kind: "complaint",
            entry_id: editor.entry!.id,
            text: title.trim(),
          }),
        "Скаргу надіслано",
      );
      return;
    }
    if (editor.kind === "proposal") {
      const body = {
        kind: "proposal" as const,
        text: title.trim(),
        description,
        photo,
        date: free ? null : date,
        meal: free ? ("" as const) : meal,
        version: editor.item?.updated_at,
      };
      await run(
        () =>
          editor.item
            ? menuApi.review(id, editor.item.id, body)
            : menuApi.feedback(id, body),
        "Пропозицію збережено",
      );
      return;
    }
    if (editor.kind === "review") {
      if (
        decision === "approved" &&
        slotMenu?.published_at &&
        !(await confirm("Змінити затверджене меню й повідомити учасників?"))
      )
        return;
      if (editor.item?.kind === "complaint" && !response.trim()) {
        setFormError("Додайте відповідь учаснику.");
        return;
      }
      await run(
        () =>
          menuApi.review(id, editor.item!.id, {
            status: decision,
            confirm: !!slotMenu?.published_at,
            response,
            date,
            meal,
            replace_id: replaceId,
            version: editor.item!.updated_at,
          }),
        "Звернення опрацьовано",
      );
    }
  }
  const text = (value: string, muted = false) => (
    <Text
      style={{
        color: muted ? c.sub : c.text,
        fontSize: muted ? 12 : 15,
        lineHeight: 22,
      }}
    >
      {value}
    </Text>
  );
  const btn = (
    label: string,
    action: () => void,
    selected = false,
    disabled = false,
    icon?: IconSymbolName,
  ) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy || disabled, selected }}
      disabled={busy || disabled}
      onPress={action}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 12,
        paddingVertical: 11,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: selected ? "#164B73" : c.border,
        backgroundColor: selected ? "#164B73" : c.card,
        opacity: busy || disabled ? 0.5 : pressed ? 0.7 : 1,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "row",
        gap: 6,
      })}
    >
      {icon && (
        <IconSymbol name={icon} size={15} color={selected ? "white" : c.text} />
      )}
      <Text
        style={{
          textAlign: "center",
          lineHeight: 20,
          includeFontPadding: false,
          color: selected ? "white" : c.text,
          fontWeight: "600",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
  const row = (children: React.ReactNode) => (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
      }}
    >
      {children}
    </View>
  );
  const panel = (children: React.ReactNode, key?: string) => (
    <View
      key={key}
      style={{
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.card,
        borderRadius: 12,
        padding: 16,
        gap: 12,
      }}
    >
      {children}
    </View>
  );
  const field = (
    label: string,
    value: string,
    set: (s: string) => void,
    required = false,
    multiline = false,
  ) => (
    <FormField
      label={label}
      required={required}
      value={value}
      editable={!busy && !photoBusy}
      multiline={multiline}
      error={
        formError && required && !value.trim() ? "Заповніть це поле" : undefined
      }
      onChangeText={(v) => {
        set(v);
        setDirty(true);
      }}
    />
  );
  const slotFields = (
    <>
      {text("День і прийом їжі", true)}
      {row(
        weekDays(date || next).map((d) =>
          btn(
            dateLabel(d),
            () => {
              setDate(d);
              setDirty(true);
            },
            d === date,
          ),
        ),
      )}
      {row(
        (slotMenu?.week_meals || selectedMeals).map((m) =>
          btn(
            meals[m],
            () => {
              setMeal(m);
              setDirty(true);
            },
            m === meal,
          ),
        ),
      )}
    </>
  );
  const photoFields = (
    <>
      {row(
        <>
          {btn("Фото з пристрою", () => void choosePhoto(), false, photoBusy)}
          {btn("Камера", () => void choosePhoto(true), false, photoBusy)}
          {photo &&
            btn("Прибрати фото", () => {
              setPhoto("");
              setDirty(true);
            })}
        </>,
      )}
      {photoBusy && text("Обробка фото…", true)}
      {photo && (
        <Image
          source={{ uri: photo }}
          accessibilityLabel={title || "Фото страви"}
          style={{ height: 230, borderRadius: 10 }}
          resizeMode="contain"
        />
      )}
    </>
  );
  const iconBtn = (
    name: IconSymbolName,
    label: string,
    action: () => void,
    disabled = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy || disabled }}
      disabled={busy || disabled}
      onPress={action}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.card,
        alignItems: "center",
        justifyContent: "center",
        opacity: busy || disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <IconSymbol name={name} size={20} color={c.text} />
    </Pressable>
  );
  const todayPill = (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: "rgba(14,165,233,0.15)",
      }}
    >
      <Text style={{ color: TG_ACCENT, fontSize: 11, fontWeight: "700" }}>
        Сьогодні
      </Text>
    </View>
  );
  const entriesOf = (d: string, m: Meal) =>
    menu!.entries.filter((e) => e.date === d && e.meal === m);
  const addRow = (d: string, m: Meal) => (
    <Pressable
      key="add"
      accessibilityRole="button"
      accessibilityLabel={`Додати страву: ${meals[m]}`}
      disabled={busy}
      onPress={() => open({ kind: "dish", date: d, meal: m })}
      style={({ pressed }) => ({
        minHeight: 44,
        borderRadius: 10,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: c.border,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ color: c.sub, fontSize: 13, fontWeight: "600" }}>
        ＋ Додати
      </Text>
    </Pressable>
  );
  const emptyMark = (
    <Text
      key="empty"
      accessibilityLabel="Не заплановано"
      style={{ color: c.faint, fontSize: 15, lineHeight: 22 }}
    >
      —
    </Text>
  );
  // Одна страва: назва головна, опис другорядний, фото — мініатюра або значок.
  function dish(e: MenuEntry, size: "phone" | "tablet" | "desktop") {
    const thumb =
      size === "phone" && e.has_photo
        ? thumbs.current.get(`${id}:${e.id}:${e.updated_at}`)
        : null;
    return (
      <Pressable
        key={e.id}
        accessibilityRole="button"
        accessibilityLabel={e.title}
        accessibilityHint={e.description || undefined}
        onPress={() => open({ kind: "dish", entry: e })}
        style={({ pressed }) => ({
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text
            numberOfLines={size === "desktop" ? 3 : undefined}
            style={{
              color: c.text,
              fontWeight: "600",
              fontSize: size === "phone" ? 16 : size === "tablet" ? 15 : 14,
              lineHeight: size === "phone" ? 22 : 20,
            }}
          >
            {e.title || e.description}
          </Text>
          {!!e.title && !!e.description && (
            <Text
              numberOfLines={size === "phone" ? 2 : 1}
              style={{
                color: c.sub,
                fontSize: size === "phone" ? 13 : 12,
                lineHeight: size === "phone" ? 18 : 16,
              }}
            >
              {e.description}
            </Text>
          )}
        </View>
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            accessibilityIgnoresInvertColors
            style={{ width: 56, height: 56, borderRadius: 10 }}
          />
        ) : (
          e.has_photo && (
            <IconSymbol name="camera.fill" size={14} color={c.faint} />
          )
        )}
      </Pressable>
    );
  }
  function slot(d: string, m: Meal, size: "phone" | "tablet" | "desktop") {
    const list = entriesOf(d, m);
    return (
      <View style={{ gap: 8 }}>
        {list.map((e) => dish(e, size))}
        {showAdd ? addRow(d, m) : !list.length && emptyMark}
      </View>
    );
  }
  // Рядок прийому їжі: ліворуч іконка й назва, праворуч страви.
  const mealRow = (
    d: string,
    m: Meal,
    size: "phone" | "tablet",
    first: boolean,
  ) => (
    <View
      key={m}
      style={{
        flexDirection: "row",
        gap: 12,
        paddingVertical: 12,
        borderTopWidth: first ? 0 : 1,
        borderColor: c.border,
      }}
    >
      <View
        style={{ width: size === "phone" ? 92 : 76, gap: 4, paddingTop: 2 }}
      >
        <IconSymbol
          name={MEAL_META[m].icon}
          size={18}
          color={MEAL_META[m].color}
        />
        <Text
          style={{
            color: c.sub,
            fontSize: 12,
            fontWeight: "700",
            letterSpacing: 0.3,
          }}
        >
          {meals[m]}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>{slot(d, m, size)}</View>
    </View>
  );
  const badge = (
    tone: "ok" | "warn" | "muted",
    label: string,
    icon?: IconSymbolName,
  ) => {
    const fg =
      tone === "ok"
        ? c.isDark
          ? "#34D399"
          : "#047857"
        : tone === "warn"
          ? c.isDark
            ? "#FBBF24"
            : "#B45309"
          : c.sub;
    return (
      <View
        accessibilityRole="text"
        accessibilityLabel={`Статус: ${label}`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor:
            tone === "ok"
              ? TG_OK + "24"
              : tone === "warn"
                ? TG_WARN + "24"
                : c.chip,
        }}
      >
        {icon && <IconSymbol name={icon} size={14} color={fg} />}
        <Text style={{ color: fg, fontSize: 12, fontWeight: "700" }}>
          {label}
        </Text>
      </View>
    );
  };
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.bg1 }}
      edges={["top", "left", "right"]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={{
          paddingHorizontal: 16,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        {iconBtn("chevron.left", "Назад", () =>
          router.canGoBack() ? router.back() : router.replace("/"),
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            accessibilityRole="header"
            style={{ color: c.text, fontSize: 22, fontWeight: "700" }}
          >
            Меню
          </Text>
          {!!menu?.name && (
            <Text numberOfLines={1} style={{ color: c.sub, fontSize: 13 }}>
              {menu.name}
            </Text>
          )}
        </View>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        onLayout={(e) =>
          setWidth(Math.min(e.nativeEvent.layout.width, 1280) - 32)
        }
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refresh()}
          />
        }
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 100,
          gap: 16,
          width: "100%",
          maxWidth: 1280,
          alignSelf: "center",
        }}
      >
        {!!error && (
          <Text accessibilityRole="alert" style={{ color: "#DE350B" }}>
            {error}
          </Text>
        )}
        {!!message && text(message)}
        {(!menu || tab === "settings") &&
          row(
            <>
              {btn("＋ Створити групу", () => open({ kind: "create" }))}
              {btn("Приєднатися за посиланням", () => open({ kind: "join" }))}
            </>,
          )}
        {spaces.length > 0 && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {spaces
                  .filter((x) => showArchive || !x.archived || x.id === id)
                  .map((x) =>
                    btn(
                      x.name + (x.archived ? " · Архів" : ""),
                      () => {
                        setId(x.id);
                        setWeek("");
                      },
                      x.id === id,
                    ),
                  )}
              </View>
            </ScrollView>
            {tab === "settings" &&
              btn(showArchive ? "Сховати архів" : "Показати архів", () =>
                setShowArchive(!showArchive),
              )}
          </>
        )}
        {!loading &&
          !menu &&
          !error &&
          panel(
            <>
              <Text style={{ fontSize: 22, fontWeight: "700", color: c.text }}>
                Спільний тиждень починається тут
              </Text>
              {text(
                "Створи групу для сім’ї, співмешканців або команди. Власник затверджує меню, учасники пропонують страви.",
                true,
              )}
            </>,
          )}
        {menu && (
          <>
            {row(
              [
                ["menu", "Меню"],
                [
                  "requests",
                  `Звернення${pending.length ? " · " + pending.length : ""}`,
                ],
                ["members", "Учасники"],
                ["settings", "Група"],
              ].map(([key, label]) =>
                btn(label, () => setTab(key), tab === key),
              ),
            )}
            {menu.archived &&
              panel(text("Група в архіві. Доступний лише перегляд."))}
            {tab === "menu" && (
              <>
                {/* Статус тижня: перемикач тижнів, бейдж і головна дія. */}
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: c.card,
                    borderRadius: 14,
                    padding: 12,
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {iconBtn("chevron.left", "Попередній тиждень", () =>
                      setWeek(addDays(menu.week, -7)),
                    )}
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text
                        style={{
                          color: c.text,
                          fontSize: 17,
                          fontWeight: "600",
                          textAlign: "center",
                        }}
                      >
                        {dateLabel(menu.week)} —{" "}
                        {dateLabel(addDays(menu.week, 6))}
                      </Text>
                      <Text style={{ color: c.sub, fontSize: 12 }}>
                        {menu.archived
                          ? "Архів"
                          : menu.week === current
                            ? "Цей тиждень"
                            : menu.week === next
                              ? "Наступний тиждень"
                              : menu.week === addDays(current, -7)
                                ? "Минулий тиждень"
                                : "Архів"}
                      </Text>
                    </View>
                    {iconBtn(
                      "chevron.right",
                      "Наступний тиждень",
                      () => setWeek(addDays(menu.week, 7)),
                      menu.week >= next,
                    )}
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {approved
                      ? canEdit && editApproved
                        ? badge("warn", "Редагування затвердженого", "pencil")
                        : badge("ok", "Затверджено", "checkmark.seal")
                      : canEdit
                        ? badge("warn", "Чернетка")
                        : badge("muted", "Не затверджено")}
                    <Text style={{ color: c.sub, fontSize: 12, flexShrink: 1 }}>
                      {menu.timezone} ·{" "}
                      {menu.is_owner ? "Ви власник" : "Ви учасник"}
                    </Text>
                    <View style={{ flexGrow: 1 }} />
                    {canEdit &&
                      approved &&
                      (editApproved
                        ? btn("Готово", () => setEditApproved(false), true)
                        : btn("Редагувати", () => setEditApproved(true), false, false, "pencil"))}
                    {canEdit &&
                      !approved &&
                      btn(
                        pendingWeek
                          ? `Опрацюйте пропозиції: ${pendingWeek}`
                          : "Затвердити тиждень",
                        () =>
                          void (async () => {
                            const empty = days.reduce(
                              (n, d) =>
                                n +
                                menu.week_meals.filter(
                                  (m) =>
                                    !menu.entries.some(
                                      (e) => e.date === d && e.meal === m,
                                    ),
                                ).length,
                              0,
                            );
                            if (
                              await confirm(
                                `${empty ? "Не заплановано прийомів їжі: " + empty + ". " : ""}Затвердити тиждень і закрити пропозиції?`,
                              )
                            )
                              await run(
                                () => menuApi.publish(id, menu.week, true),
                                "Тиждень затверджено",
                              );
                          })(),
                        true,
                        pendingWeek > 0,
                      )}
                    {!menu.is_owner &&
                      proposalsOpen &&
                      btn(
                        "＋ Пропозиція на наступний тиждень",
                        () => open({ kind: "proposal" }),
                        true,
                      )}
                  </View>
                  {canEdit &&
                    approved &&
                    editApproved &&
                    text(
                      "Зміни в затвердженому меню надсилають сповіщення учасникам.",
                      true,
                    )}
                  <View style={{ flexDirection: "row", gap: 16 }}>
                    {[
                      [current, "До цього тижня"],
                      [next, "До наступного"],
                    ]
                      .filter(([w]) => w !== menu.week)
                      .map(([w, label]) => (
                        <Pressable
                          key={label}
                          accessibilityRole="link"
                          onPress={() => setWeek(w)}
                          style={{ minHeight: 44, justifyContent: "center" }}
                        >
                          <Text
                            style={{
                              color: TG_ACCENT,
                              fontSize: 13,
                              fontWeight: "600",
                            }}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      ))}
                  </View>
                </View>
                {layout === "desktop" ? (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: c.border,
                      borderRadius: 12,
                      overflow: "hidden",
                    }}
                  >
                    <View style={{ flexDirection: "row" }}>
                      <View style={{ width: 104, backgroundColor: c.card }} />
                      {days.map((d) => (
                        <View
                          key={d}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            padding: 10,
                            gap: 2,
                            borderLeftWidth: 1,
                            borderColor: c.border,
                            borderTopWidth: 3,
                            borderTopColor:
                              d === menu.today ? TG_ACCENT : "transparent",
                            backgroundColor: d === menu.today ? c.chip : c.card,
                          }}
                        >
                          <Text
                            style={{
                              color: d === menu.today ? TG_ACCENT : c.sub,
                              fontSize: 11,
                              fontWeight: "700",
                              textTransform: "uppercase",
                            }}
                          >
                            {weekdayLabel(d, "short")}
                          </Text>
                          <Text
                            style={{
                              color: c.text,
                              fontSize: 20,
                              fontWeight: "700",
                            }}
                          >
                            {Number(d.slice(-2))}
                          </Text>
                        </View>
                      ))}
                    </View>
                    {orderedMeals.map((m) => (
                      <View
                        key={m}
                        style={{
                          flexDirection: "row",
                          borderTopWidth: 1,
                          borderColor: c.border,
                        }}
                      >
                        <View
                          style={{
                            width: 104,
                            padding: 10,
                            gap: 4,
                            backgroundColor: c.card,
                          }}
                        >
                          <IconSymbol
                            name={MEAL_META[m].icon}
                            size={18}
                            color={MEAL_META[m].color}
                          />
                          <Text
                            style={{
                              color: c.sub,
                              fontSize: 12,
                              fontWeight: "700",
                            }}
                          >
                            {meals[m]}
                          </Text>
                        </View>
                        {days.map((d) => (
                          <View
                            key={d}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              minHeight: 72,
                              padding: 8,
                              borderLeftWidth: 1,
                              borderColor: c.border,
                              backgroundColor:
                                d === menu.today ? c.chip : undefined,
                              justifyContent:
                                !showAdd && !entriesOf(d, m).length
                                  ? "center"
                                  : "flex-start",
                              alignItems:
                                !showAdd && !entriesOf(d, m).length
                                  ? "center"
                                  : "stretch",
                            }}
                          >
                            {slot(d, m, "desktop")}
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                ) : layout === "tablet" ? (
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}
                  >
                    {days.map((d) => (
                      <View
                        key={d}
                        style={{
                          width: Math.floor((width - 12) / 2),
                          borderWidth: d === menu.today ? 2 : 1,
                          borderColor: d === menu.today ? TG_ACCENT : c.border,
                          backgroundColor: c.card,
                          borderRadius: 14,
                          paddingHorizontal: 16,
                          paddingTop: 14,
                          paddingBottom: 4,
                          opacity:
                            menu.week === current && d < menu.today ? 0.6 : 1,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <Text
                            style={{
                              color: c.text,
                              fontSize: 15,
                              fontWeight: "600",
                            }}
                          >
                            {cap(weekdayLabel(d, "long"))}
                          </Text>
                          <Text style={{ color: c.sub, fontSize: 13, flex: 1 }}>
                            {dateLabel(d)}
                          </Text>
                          {d === menu.today && todayPill}
                        </View>
                        {orderedMeals.map((m, i) =>
                          mealRow(d, m, "tablet", i === 0),
                        )}
                      </View>
                    ))}
                  </View>
                ) : (
                  <>
                    <View style={{ flexDirection: "row", gap: 4 }}>
                      {days.map((d) => {
                        const selected = d === day,
                          isToday = d === menu.today,
                          hasDish = menu.entries.some((e) => e.date === d);
                        return (
                          <Pressable
                            key={d}
                            accessibilityRole="button"
                            accessibilityLabel={
                              cap(weekdayLabel(d, "long")) +
                              ", " +
                              dateLabel(d) +
                              (isToday ? ", сьогодні" : "")
                            }
                            accessibilityState={{ selected }}
                            onPress={() => setDay(d)}
                            style={{
                              flex: 1,
                              minHeight: 60,
                              borderRadius: 12,
                              paddingVertical: 8,
                              alignItems: "center",
                              gap: 2,
                              borderWidth: 1.5,
                              borderColor: selected
                                ? TG_ACCENT
                                : isToday
                                  ? TG_ACCENT
                                  : c.border,
                              backgroundColor: selected ? TG_ACCENT : c.card,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                color: selected ? "white" : c.sub,
                              }}
                            >
                              {weekdayLabel(d, "short")}
                            </Text>
                            <Text
                              style={{
                                fontSize: 18,
                                color: selected ? "white" : c.text,
                                fontWeight: "700",
                              }}
                            >
                              {Number(d.slice(-2))}
                            </Text>
                            <View
                              style={{
                                width: 4,
                                height: 4,
                                borderRadius: 2,
                                backgroundColor: selected
                                  ? isToday || hasDish
                                    ? "white"
                                    : "transparent"
                                  : isToday
                                    ? TG_ACCENT
                                    : hasDish
                                      ? c.faint
                                      : "transparent",
                              }}
                            />
                          </Pressable>
                        );
                      })}
                    </View>
                    {!!day && (
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: c.border,
                          backgroundColor: c.card,
                          borderRadius: 14,
                          paddingHorizontal: 16,
                          paddingTop: 16,
                          paddingBottom: 4,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <Text
                            accessibilityRole="header"
                            style={{
                              color: c.text,
                              fontSize: 17,
                              fontWeight: "600",
                            }}
                          >
                            {cap(
                              new Date(day + "T12:00").toLocaleDateString(
                                "uk-UA",
                                {
                                  weekday: "long",
                                  day: "numeric",
                                  month: "long",
                                },
                              ),
                            )}
                          </Text>
                          {day === menu.today && todayPill}
                        </View>
                        {orderedMeals.map((m, i) =>
                          mealRow(day, m, "phone", i === 0),
                        )}
                      </View>
                    )}
                  </>
                )}
              </>
            )}
            {tab === "requests" && (
              <>
                {row(
                  <>
                    {btn(
                      "Пропозиції",
                      () => setFilter("proposal"),
                      filter === "proposal",
                    )}
                    {btn(
                      "Скарги",
                      () => setFilter("complaint"),
                      filter === "complaint",
                    )}
                    {btn(history ? "На розгляді" : "Історія", () =>
                      setHistory(!history),
                    )}
                  </>,
                )}
                {text("Приватно: звернення бачать лише автор і власник.", true)}
                {proposalsOpen &&
                  btn(
                    "Запропонувати страву",
                    () => open({ kind: "proposal" }),
                    true,
                  )}
                {menu.feedback
                  .filter(
                    (f) =>
                      f.kind === filter &&
                      (history
                        ? f.status !== "pending"
                        : f.status === "pending"),
                  )
                  .map((f) =>
                    panel(
                      <>
                        <Text style={{ color: c.text, fontWeight: "700" }}>
                          {f.kind === "complaint"
                            ? f.snapshot.title || "Скарга"
                            : f.text}
                        </Text>
                        {text(
                          `${f.author} · ${f.date ? dateLabel(f.date) : "Вільна ідея"} · ${feedbackStatus[f.status] || f.status}`,
                          true,
                        )}
                        {f.kind === "complaint" && text(f.text)}
                        {!!f.description && text(f.description)}
                        {f.dish_changed &&
                          text(
                            "Страву змінено або видалено після звернення.",
                            true,
                          )}
                        {!!f.response && text("Відповідь: " + f.response)}
                        {row(
                          <>
                            {f.status === "pending" &&
                              !menu.archived &&
                              menu.is_owner &&
                              btn(
                                "Розглянути",
                                () => open({ kind: "review", item: f }),
                                true,
                              )}
                            {f.status === "pending" &&
                              !menu.archived &&
                              f.is_mine &&
                              f.kind === "proposal" &&
                              f.week === next && (
                                <>
                                  {btn("Редагувати", () =>
                                    open({ kind: "proposal", item: f }),
                                  )}
                                  {btn(
                                    "Відкликати",
                                    () =>
                                      void (async () => {
                                        if (
                                          await confirm(
                                            "Відкликати пропозицію?",
                                          )
                                        )
                                          await run(
                                            () =>
                                              menuApi.review(id, f.id, {
                                                status: "withdrawn",
                                                version: f.updated_at,
                                              }),
                                            "Пропозицію відкликано",
                                          );
                                      })(),
                                  )}
                                </>
                              )}
                          </>,
                        )}
                      </>,
                      String(f.id),
                    ),
                  )}
                {!menu.feedback.some(
                  (f) =>
                    f.kind === filter &&
                    (history ? f.status !== "pending" : f.status === "pending"),
                ) &&
                  panel(
                    text(history ? "Історія поки порожня" : "Усе опрацьовано"),
                  )}
              </>
            )}
            {tab === "members" && (
              <>
                {menu.is_owner &&
                  !menu.archived &&
                  btn(
                    "Запросити учасників",
                    () => open({ kind: "invite" }),
                    true,
                  )}
                {menu.members.map((m) =>
                  panel(
                    <>
                      {text(m.name + (m.owner ? " · Власник" : ""))}
                      {!m.owner &&
                        !menu.archived &&
                        (menu.is_owner || String(m.id) === user?.id) &&
                        btn(
                          menu.is_owner ? "Видалити учасника" : "Вийти з групи",
                          () =>
                            void (async () => {
                              if (
                                await confirm(
                                  "Припинити доступ до групи? Історія звернень збережеться.",
                                )
                              )
                                await run(
                                  () => menuApi.leave(id, m.id),
                                  "Доступ припинено",
                                );
                            })(),
                        )}
                    </>,
                    String(m.id),
                  ),
                )}
                {menu.is_owner &&
                  menu.invites.map((i) =>
                    panel(
                      <>
                        {text(
                          `${i.email || "Спільне посилання"} · ${i.revoked ? "Відкликано" : "до " + new Date(i.expires_at).toLocaleDateString("uk-UA")}`,
                          true,
                        )}
                        {!i.revoked &&
                          !menu.archived &&
                          btn(
                            "Відкликати запрошення",
                            () =>
                              void (async () => {
                                if (
                                  await confirm(
                                    "Відкликати посилання? Учасники залишаться в групі.",
                                  )
                                )
                                  await run(
                                    () => menuApi.revoke(id, i.id),
                                    "Запрошення відкликано",
                                  );
                              })(),
                          )}
                      </>,
                      i.id,
                    ),
                  )}
              </>
            )}
            {tab === "settings" &&
              panel(
                <>
                  <Text
                    style={{ color: c.text, fontSize: 20, fontWeight: "700" }}
                  >
                    {menu.name}
                  </Text>
                  {text(menu.timezone + " · Понеділок — неділя", true)}
                  {text(menu.meals.map((m) => meals[m]).join(" · "))}
                  {text(
                    "Нові прийоми їжі застосовуються лише до ще не створених тижнів.",
                    true,
                  )}
                  {menu.is_owner && (
                    <>
                      {!menu.archived &&
                        btn("Налаштувати групу", () =>
                          open({ kind: "settings" }),
                        )}
                      {btn(
                        menu.archived ? "Відновити групу" : "Архівувати групу",
                        () =>
                          void (async () => {
                            if (
                              await confirm(
                                menu.archived
                                  ? "Відновити групу? Старі запрошення залишаться відкликаними."
                                  : "Архівувати групу? Учасники збережуть доступ до історії.",
                              )
                            )
                              await run(
                                () =>
                                  menuApi.settings(id, {
                                    archived: !menu.archived,
                                  }),
                                "Стан групи оновлено",
                              );
                          })(),
                      )}
                    </>
                  )}
                </>,
              )}
          </>
        )}
      </ScrollView>
      <Modal
        visible={!!editor}
        animationType="slide"
        presentationStyle={layout !== "phone" ? "formSheet" : "fullScreen"}
        onRequestClose={() => void close()}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg1 }}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View
              style={{
                padding: 16,
                borderBottomWidth: 1,
                borderColor: c.border,
              }}
            >
              {row(
                <>
                  {btn("‹ Назад", () => void close(), false, photoBusy)}
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 19,
                      fontWeight: "700",
                      color: c.text,
                    }}
                  >
                    {editor?.kind === "dish"
                      ? "Страва"
                      : editor?.kind === "proposal"
                        ? "Пропозиція"
                        : editor?.kind === "complaint"
                          ? "Скарга"
                          : editor?.kind === "review"
                            ? "Розгляд звернення"
                            : editor?.kind === "invite"
                              ? "Запрошення"
                              : editor?.kind === "join"
                                ? "Приєднатися"
                                : "Група меню"}
                  </Text>
                </>,
              )}
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                padding: 20,
                gap: 14,
                paddingBottom: 40,
              }}
            >
              {!!formError && (
                <Text accessibilityRole="alert" style={{ color: "#DE350B" }}>
                  {formError}
                </Text>
              )}
              {editor && ["create", "settings"].includes(editor.kind) && (
                <>
                  {field("Назва групи", title, setTitle, true)}
                  {field("Часовий пояс", zone, setZone, true)}
                  {text("Прийоми їжі", true)}
                  {row(
                    (Object.keys(meals) as Meal[]).map((m) =>
                      btn(
                        meals[m],
                        () => {
                          setSelectedMeals((v) =>
                            v.includes(m)
                              ? v.filter((x) => x !== m)
                              : [...v, m],
                          );
                          setDirty(true);
                        },
                        selectedMeals.includes(m),
                      ),
                    ),
                  )}
                  {text(
                    "Власник затверджує меню, учасники подають приватні пропозиції.",
                    true,
                  )}
                </>
              )}
              {editor?.kind === "join" &&
                field("Посилання запрошення", title, setTitle, true)}
              {editor?.kind === "invite" && (
                <>
                  {field("Email (необов’язково)", title, setTitle)}
                  {text(
                    "Наявного користувача додаємо одразу. Без email створимо посилання на 7 днів.",
                    true,
                  )}
                </>
              )}
              {editor?.kind === "dish" && readOnly ? (
                <>
                  <Text
                    style={{ fontSize: 24, color: c.text, fontWeight: "700" }}
                  >
                    {title}
                  </Text>
                  {text(dateLabel(date) + " · " + meals[meal], true)}
                  {text(description || "Без опису")}
                  {photo && (
                    <Image
                      source={{ uri: photo }}
                      style={{ height: 250 }}
                      resizeMode="contain"
                    />
                  )}
                  {!menu?.archived &&
                    !menu?.is_owner &&
                    weekDays(date)[0] === current &&
                    btn("Поскаржитися", () => {
                      const entry = editor.entry;
                      open({ kind: "complaint", entry });
                      setTitle("");
                    })}
                </>
              ) : (
                editor &&
                ["dish", "proposal"].includes(editor.kind) && (
                  <>
                    {editor.kind === "proposal" && (
                      <>
                        {text(
                          "Приватна пропозиція на наступний тиждень.",
                          true,
                        )}
                        {row(
                          <>
                            {btn(
                              "Вільна ідея",
                              () => {
                                setFree(true);
                                setDirty(true);
                              },
                              free,
                            )}
                            {btn(
                              "Конкретний день",
                              () => {
                                setFree(false);
                                setDirty(true);
                              },
                              !free,
                            )}
                          </>,
                        )}
                      </>
                    )}
                    {(editor.kind === "dish" || !free) && slotFields}
                    {editor.kind === "dish" && !editor.entry && (
                      <>
                        {field("Знайти попередню страву", query, setQuery)}
                        {btn(
                          "Знайти",
                          () =>
                            void menuApi
                              .library(id, query)
                              .then((r) => setLibrary(r.results))
                              .catch((e) => setFormError(errorText(e))),
                        )}
                        {library.map((e) =>
                          btn(
                            e.title + " · " + dateLabel(e.date) + " #" + e.id,
                            () => {
                              void copyDish(e);
                            },
                          ),
                        )}
                      </>
                    )}
                    {field("Назва страви", title, setTitle, true)}
                    {field("Опис", description, setDescription, false, true)}
                    {copyId &&
                      text(
                        "Додаємо копію разом із фото, якщо воно було.",
                        true,
                      )}
                    {photoFields}
                  </>
                )
              )}
              {editor?.kind === "complaint" && (
                <>
                  {panel(
                    <>
                      {text(editor.entry!.title)}
                      {text(editor.entry!.description, true)}
                      {text(
                        dateLabel(editor.entry!.date) +
                          " · " +
                          meals[editor.entry!.meal],
                        true,
                      )}
                    </>,
                  )}
                  {field("Що не так зі стравою?", title, setTitle, true, true)}
                  {text("Бачитимете лише ви та власник.", true)}
                </>
              )}
              {editor?.kind === "review" && (
                <>
                  {panel(
                    <>
                      {text(editor.item?.snapshot.title || editor.item!.text)}
                      {editor.item?.kind === "complaint" &&
                        text(editor.item.text)}
                      {text(editor.item!.description, true)}
                    </>,
                  )}
                  {photo && (
                    <Image
                      source={{ uri: photo }}
                      style={{ height: 220 }}
                      resizeMode="contain"
                    />
                  )}
                  {editor.item?.kind === "proposal" && (
                    <>
                      {row(
                        <>
                          {btn(
                            "Додати в меню",
                            () => setDecision("approved"),
                            decision === "approved",
                          )}
                          {btn(
                            "Відхилити",
                            () => setDecision("rejected"),
                            decision === "rejected",
                          )}
                        </>,
                      )}
                      {decision === "approved" && (
                        <>
                          {slotFields}
                          {text("Як додати страву?", true)}
                          {btn(
                            "Окрема нова страва",
                            () => setReplaceId(undefined),
                            !replaceId,
                          )}
                          {slotMenu?.entries
                            .filter((e) => e.date === date && e.meal === meal)
                            .map((e) =>
                              btn(
                                "Замінити: " + e.title,
                                () => setReplaceId(e.id),
                                replaceId === e.id,
                              ),
                            )}
                        </>
                      )}
                    </>
                  )}
                  {field(
                    editor.item?.kind === "complaint"
                      ? "Відповідь учаснику"
                      : "Пояснення (необов’язково)",
                    response,
                    setResponse,
                    editor.item?.kind === "complaint",
                    true,
                  )}
                </>
              )}
              {!(editor?.kind === "dish" && readOnly) &&
                btn(
                  busy
                    ? "Зберігаємо…"
                    : editor?.kind === "invite"
                      ? title
                        ? "Запросити за email"
                        : "Створити й поширити посилання"
                      : editor?.kind === "review"
                        ? "Підтвердити рішення"
                        : editor?.kind === "join"
                          ? "Переглянути запрошення"
                          : "Зберегти",
                  () => void submit(),
                  true,
                  photoBusy,
                )}
              {editor?.kind === "dish" &&
                editor.entry &&
                !readOnly &&
                btn(
                  "Видалити страву",
                  () =>
                    void (async () => {
                      if (
                        await confirm(
                          "Видалити страву? Історія звернень залишиться." +
                            (menu?.published_at
                              ? " Учасники отримають сповіщення."
                              : ""),
                        )
                      )
                        await run(
                          () =>
                            menuApi.remove(
                              id,
                              editor.entry!,
                              !!menu?.published_at,
                            ),
                          "Страву видалено",
                        );
                    })(),
                )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
