import React from "react";
import { ScrollView, Alert } from "react-native";
import { FormField } from "@/components/shared/FormField";
import WeeklyMenu from "@/app/menu";

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
}));
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
  if (tree) act(() => tree.unmount());
  jest.restoreAllMocks();
});
test("phone starts at today; tablet changes layout from actual content width", async () => {
  await act(async () => {
    tree = create(<WeeklyMenu />);
  });
  expect(allText(tree.toJSON())).toContain("Суп сьогодні");
  expect(allText(tree.toJSON())).not.toContain("Риба завтра");
  const scroller = tree.root
    .findAllByType(ScrollView)
    .find((n: any) => n.props.onLayout);
  act(() =>
    scroller.props.onLayout({ nativeEvent: { layout: { width: 1100 } } }),
  );
  expect(allText(tree.toJSON())).toContain("Риба завтра");
  act(() =>
    scroller.props.onLayout({ nativeEvent: { layout: { width: 600 } } }),
  );
  expect(allText(tree.toJSON())).not.toContain("Риба завтра");
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
