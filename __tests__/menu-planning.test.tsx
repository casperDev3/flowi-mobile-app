import React from "react";
import { Alert } from "react-native";
import { FormField } from "@/components/shared/FormField";
import WeeklyMenu from "@/app/menu";

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// Клас вікна керує розкладкою (телефон: один день; планшет: список + день).
let mockSize: "compact" | "medium" | "expanded" = "compact";
jest.mock("@/hooks/use-responsive", () => {
  const widths = { compact: 390, medium: 744, expanded: 1194 };
  const responsive = () => ({
    width: widths[mockSize],
    height: 900,
    sizeClass: mockSize,
    isCompact: mockSize === "compact",
    isMedium: mockSize === "medium",
    isExpanded: mockSize === "expanded",
    isWide: mockSize !== "compact",
    landscape: false,
  });
  return {
    useResponsive: responsive,
    useScreenWidth: () => widths[mockSize] - (mockSize === "compact" ? 0 : 76),
    useBreakpointValue: (v: any) => v[mockSize] ?? v.compact,
  };
});
// Нові рядки модуля чекають інтеграції в store/translations.ts; до того —
// беремо їх із файлу хвилі, щоб екран рендерився з tr.menu.*.
jest.mock("@/store/i18n", () => {
  const { allTranslations } = jest.requireActual("@/store/translations");
  const uk = allTranslations.uk;
  let menu = uk.menu;
  if (!menu) {
    menu = {};
    try {
      const rows = require("../../.wf-i18n-1007/m-menu.json");
      for (const r of rows) menu[r.path.split(".")[1]] = r.uk;
    } catch {
      // Файлу вже немає — ключі мали потрапити в translations.ts.
    }
  }
  const tr = { ...uk, menu };
  return { useI18n: () => ({ lang: "uk", setLang: () => {}, tr }) };
});
jest.mock("expo-image-picker", () => ({}));
jest.mock("expo-image-manipulator", () => ({}));
jest.mock("@/hooks/use-color-scheme", () => ({
  useColorScheme: () => "light",
}));
jest.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "1" } }) }));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ space: "home" }),
  useRouter: () => ({
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
  useFocusEffect: (fn: () => void) => {
    // Jest mock factories cannot capture the outer React import.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require("react");
    React.useEffect(fn, [fn]);
  },
  Stack: { Screen: () => null },
  usePathname: () => "/menu",
}));
let mockMenu: any;
const mockSave = jest.fn(async (...args: unknown[]) => ({ args }));
jest.mock("@/store/menu-api", () => {
  const actual = jest.requireActual("@/store/menu-api");
  return {
    ...actual,
    menuApi: {
      list: jest.fn(async () => ({ results: [mockMenu] })),
      get: jest.fn(async () => mockMenu),
      save: (...args: unknown[]) => mockSave(...args),
    },
  };
});
jest.mock("@/store/api", () => ({ apiFetch: jest.fn() }));
// Component tests use react-test-renderer; they do not validate device runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require("react-test-renderer") as any;
let tree: any;
const allText = (node: any): string =>
  typeof node === "string"
    ? node
    : Array.isArray(node)
      ? node.map(allText).join(" ")
      : node?.children
        ? allText(node.children)
        : node?.props?.children
          ? allText(node.props.children)
          : "";
function button(label: string) {
  return tree.root.findAll(
    (n: any) =>
      n.props.accessibilityLabel === label &&
      typeof n.props.onPress === "function",
  )[0];
}
beforeEach(() => {
  mockSave.mockClear();
  mockMenu = {
    id: "home",
    name: "Дім",
    is_owner: true,
    timezone: "Europe/Kyiv",
    today: "2026-09-28",
    week: "2026-09-28",
    meals: ["lunch"],
    week_meals: ["lunch"],
    archived: false,
    published_at: null,
    feedback: [],
    members: [],
    invites: [],
    entries: [
      {
        id: 1,
        title: "Суп сьогодні",
        description: "Овочевий",
        date: "2026-09-28",
        meal: "lunch",
        updated_at: "v1",
        has_photo: false,
      },
      {
        id: 2,
        title: "Риба завтра",
        description: "",
        date: "2026-09-29",
        meal: "lunch",
        updated_at: "v2",
        has_photo: false,
      },
    ],
  };
});
afterEach(() => {
  mockSize = "compact";
  if (tree) act(() => tree.unmount());
  jest.restoreAllMocks();
});
test("phone shows one selected day; tablet shows day list + selected day", async () => {
  mockSize = "compact";
  await act(async () => {
    tree = create(<WeeklyMenu />);
  });
  expect(allText(tree.toJSON())).toContain("Суп сьогодні");
  expect(allText(tree.toJSON())).not.toContain("Риба завтра");
  await act(async () => {
    tree.unmount();
  });
  mockSize = "medium";
  await act(async () => {
    tree = create(<WeeklyMenu />);
  });
  // Ліворуч — список днів зі зведенням (страва завтра видна у рядку дня),
  // праворуч — сьогоднішній день повністю (з описом страви).
  const txt = allText(tree.toJSON());
  expect(txt).toContain("Риба завтра");
  expect(txt).toContain("Овочевий");
  const tuesday = tree.root.findAll(
    (n: any) =>
      typeof n.props.accessibilityLabel === "string" &&
      n.props.accessibilityLabel.startsWith("Вівторок") &&
      typeof n.props.onPress === "function",
  )[0];
  act(() => tuesday.props.onPress());
  // Тепер праворуч вівторок: кнопка страви «Риба завтра» стала натисканою.
  expect(button("Риба завтра")).toBeDefined();
  expect(button("Суп сьогодні")).toBeUndefined();
});
test("dish editor prefills existing dish and saves it by id/version", async () => {
  await act(async () => {
    tree = create(<WeeklyMenu />);
  });
  act(() => button("Суп сьогодні").props.onPress());
  const field = tree.root
    .findAllByType(FormField)
    .find((n: any) => n.props.label === "Назва страви");
  expect(field.props.value).toBe("Суп сьогодні");
  act(() => field.props.onChangeText("Борщ"));
  await act(async () => {
    button("Зберегти").props.onPress();
  });
  expect(mockSave).toHaveBeenCalledWith(
    "home",
    expect.objectContaining({ title: "Борщ", version: "v1" }),
    1,
  );
});
test("dirty form cannot close silently", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await act(async () => {
    tree = create(<WeeklyMenu />);
  });
  act(() => button("Суп сьогодні").props.onPress());
  const field = tree.root
    .findAllByType(FormField)
    .find((n: any) => n.props.label === "Назва страви");
  act(() => field.props.onChangeText("Чернетка"));
  const back = tree.root
    .findAll(
      (n: any) =>
        n.props.accessibilityLabel === "‹ Назад" &&
        typeof n.props.onPress === "function",
    )
    .at(-1);
  act(() => back.props.onPress());
  expect(alert).toHaveBeenCalledWith(
    "Підтвердження",
    "Відкинути незбережені зміни?",
    expect.any(Array),
    expect.any(Object),
  );
  expect(mockSave).not.toHaveBeenCalled();
});
test("member has no author controls", async () => {
  mockMenu = { ...mockMenu, is_owner: false };
  await act(async () => {
    tree = create(<WeeklyMenu />);
  });
  expect(button("Затвердити тиждень")).toBeUndefined();
  expect(button("＋ Страва")).toBeUndefined();
  expect(button("＋ Пропозиція на наступний тиждень")).toBeDefined();
});
