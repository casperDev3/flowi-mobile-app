/**
 * components/shared/ScreenHeader.tsx
 *
 * Фіксований хедер екрана: великий заголовок і група кнопок праворуч.
 *
 * Компонент спільний навмисно. Та сама розмітка стояла копією в шести
 * таб-екранах, і разом із копіями розповзалися два баги:
 *
 *  1. Верхній інсет віддавали нативному `SafeAreaView edges={['top']}` —
 *     через що хедер періодично малювався під статус-баром (докладно чому —
 *     у hooks/use-top-inset.ts). Тепер відступ рахує useTopInset() у JS.
 *
 *  2. Заголовок мав `flex: 1` і жодного numberOfLines. На 320pt від рядка
 *     лишалося ~158pt після трьох кнопок по 36pt, а «Завдання» у 32pt/800
 *     займає майже стільки ж — довший переклад або системне збільшення
 *     шрифту обрізало заголовок посеред слова. Тепер коробка заголовка
 *     стискається (flexShrink), а не забирає місце в кнопок.
 */

import * as ExpoRouter from 'expo-router';
import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { type HeaderLead, headerLead } from '@/components/shared/ScreenHeaderNav';
import { useResponsive } from '@/hooks/use-responsive';
import { useTopInset } from '@/hooks/use-top-inset';

/**
 * Ціль дотику 44×56pt навколо кнопки 36×36.
 *
 * Асиметрія навмисна. По вертикалі кнопці ніхто не заважає, тож там лишаються
 * історичні 10pt — звужувати вже відвантажену ціль дотику заради однаковості
 * чисел не варто. По горизонталі 10pt дати не можна: між сусідніми кнопками
 * gap 7pt, тож їхні зони перекривалися б на 13pt, і тап між двома кнопками
 * діставався б тій, що вище в порядку сиблінгів, — тобто навмання. 4pt дає
 * рівно 44pt за HIG і майже не перекривається.
 */
export const HEADER_BUTTON_HIT_SLOP = { top: 10, bottom: 10, left: 4, right: 4 } as const;

/**
 * Стеля масштабування заголовка. Dynamic Type множить кегль до 3×, а 32pt×3
 * не влазить у жодну ширину — рядок або обрізається, або витісняє кнопки.
 * Решта тексту на екранах масштабується як раніше, обмежений тільки заголовок.
 */
export const TITLE_MAX_FONT_SCALE = 1.4;

// ─── Кнопка хедера ────────────────────────────────────────────────────────────

export interface HeaderButtonProps {
  onPress: () => void;
  onLongPress?: () => void;
  /** Обов'язковий: іконка сама по собі скрінрідеру нічого не каже. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** Кольори кнопки — вони в кожного екрана свої. */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function HeaderButton({
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  children,
}: HeaderButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={HEADER_BUTTON_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={[styles.button, style]}>
      {children}
    </TouchableOpacity>
  );
}

/**
 * `usePathname()`, який переживає відсутність маршрутизатора.
 *
 * Хедер — спільний вузол: його монтують і юніт-тести окремих екранів, де
 * `expo-router` підмінений вручну кількома потрібними експортами, і прев'ю
 * компонентів. Пряме звертання до `usePathname` перетворювало кожне таке
 * середовище на «is not a function» посеред рендера, хоча шапці шлях
 * потрібен рівно для однієї необов'язкової речі — сховати стрілку.
 *
 * Вибір робиться ОДИН раз, на рівні модуля: тоді викликається завжди та сама
 * функція, і порядок хуків між рендерами не міняється. Порожній шлях означає
 * «розділу в сайдбарі немає», тобто поведінку телефона — стрілка лишається.
 */
const useRoutePathname: () => string =
  typeof ExpoRouter.usePathname === 'function' ? ExpoRouter.usePathname : () => '';

// ─── Повернення нагору ────────────────────────────────────────────────────────

/**
 * Дія «Назад». Екран каже, ЩО робити; чи малювати кнопку — вирішує хедер
 * (див. ScreenHeaderNav.ts). Екранам більше не треба знати ні про sizeClass,
 * ні про те, чи є вони в сайдбарі.
 */
export interface ScreenBack {
  onPress: () => void;
  /** Уже перекладений підпис (`tr.back`) — іконка сама скрінрідеру мовчить. */
  label: string;
  /** Колір стрілки; типово — колір заголовка. */
  color?: string;
  /** Фон і рамка кнопки: у кожного екрана своя палітра. */
  style?: StyleProp<ViewStyle>;
}

/** Ланка ланцюжка предків. Остання — поточний екран, без onPress. */
export interface Crumb {
  label: string;
  onPress?: () => void;
}

/**
 * Хлібні крихти над заголовком: «Проєкт → Учасники», «Налаштування → Акаунт».
 *
 * Стоять ОКРЕМИМ рядком, а не в рядку заголовка: на 600pt (мінімальна
 * «широка» ширина мінус 232pt сайдбара — це 368pt) ланцюжок і заголовок у
 * 32pt разом не влазять, і стискався б саме заголовок.
 */
function Breadcrumbs({ crumbs, color }: { crumbs: Crumb[]; color: string }) {
  return (
    <View style={styles.crumbs} accessibilityRole="header">
      {crumbs.map((crumb, i) => (
        <React.Fragment key={`${crumb.label}:${i}`}>
          {i > 0 ? <IconSymbol name="chevron.right" size={11} color={color} /> : null}
          {crumb.onPress ? (
            <TouchableOpacity
              onPress={crumb.onPress}
              accessibilityRole="link"
              accessibilityLabel={crumb.label}
              hitSlop={HEADER_BUTTON_HIT_SLOP}>
              <Text numberOfLines={1} style={[styles.crumb, { color }]}>
                {crumb.label}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text numberOfLines={1} style={[styles.crumb, { color }]}>
              {crumb.label}
            </Text>
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

/**
 * Рішення «що ліворуч від заголовка» для екранів, які малюють власну шапку
 * (напр. `ProjectScreenShell` через `actions`). Сам ScreenHeader кличе його
 * всередині — двічі рахувати не треба.
 */
export function useHeaderLead(opts: { hasBack: boolean; hasCrumbs?: boolean }): HeaderLead {
  const { sizeClass } = useResponsive();
  const pathname = useRoutePathname();
  return headerLead(sizeClass, pathname, {
    hasBack: opts.hasBack,
    hasCrumbs: Boolean(opts.hasCrumbs),
  });
}

// ─── Хедер ────────────────────────────────────────────────────────────────────

export interface ScreenHeaderProps {
  title: string;
  /** Колір заголовка: у кожного екрана своя тема. */
  color: string;
  /** Рядок НАД заголовком — привітання на екрані «Сьогодні». */
  eyebrow?: React.ReactNode;
  /**
   * Куди веде «Назад». Хедер ховає кнопку там, де вона рудимент: на широкому
   * екрані розділ уже відкривається з сайдбара.
   */
  back?: ScreenBack;
  /**
   * Ланцюжок предків для екранів зі справжньою ієрархією. Показується лише
   * на широкому екрані й лише замість «Назад» — див. ScreenHeaderNav.ts.
   */
  crumbs?: Crumb[];
  /** Колір крихт; типово — колір заголовка. */
  crumbColor?: string;
  /** Кнопки праворуч. */
  actions?: React.ReactNode;
  /** Вміст під рядком заголовка: MonthPicker тощо. */
  children?: React.ReactNode;
  /** Історично 10 на більшості екранів і 14 на «Час» — лишаємо це екрану. */
  paddingBottom?: number;
  /** Не всюди 32pt: на «Сьогодні» заголовок 26pt. */
  titleStyle?: StyleProp<TextStyle>;
}

export function ScreenHeader({
  title,
  color,
  eyebrow,
  actions,
  children,
  paddingBottom = 10,
  titleStyle,
  back,
  crumbs,
  crumbColor,
}: ScreenHeaderProps) {
  const topInset = useTopInset();
  const insets = useSafeAreaInsets();
  const lead = useHeaderLead({ hasBack: Boolean(back), hasCrumbs: Boolean(crumbs?.length) });

  /**
   * Бічний інсет ненульовий лише в ландшафті на пристрої з вирізом — там
   * сталих 20pt не вистачає, і перша кнопка ховається за «чубчиком».
   */
  const sidePad = 20 + Math.max(insets.left, insets.right);

  return (
    <View style={{ paddingTop: topInset + 14, paddingHorizontal: sidePad, paddingBottom }}>
      {lead === 'crumbs' && crumbs ? (
        <Breadcrumbs crumbs={crumbs} color={crumbColor ?? color} />
      ) : null}
      <View style={styles.row}>
        {/*
         * «Назад» і заголовок — одна група ліворуч. Без спільної обгортки
         * space-between розкидав би їх по краях рядка, і між стрілкою та
         * коротким заголовком зяяла б дірка на пів екрана.
         */}
        <View style={styles.lead}>
          {lead === 'back' && back ? (
            <HeaderButton
              onPress={back.onPress}
              accessibilityLabel={back.label}
              style={back.style}>
              <IconSymbol name="chevron.left" size={17} color={back.color ?? color} />
            </HeaderButton>
          ) : null}
          {/*
           * flexShrink:1 замість flex:1 — коробка заголовка віддає місце
           * кнопкам, а не забирає його. space-between на рядку тримає кнопки
           * біля правого краю навіть тоді, коли заголовок короткий.
           */}
          <View style={styles.titleBox}>
            {eyebrow}
            <Text
              style={[styles.pageTitle, titleStyle, { color }]}
              numberOfLines={1}
              maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}>
              {title}
            </Text>
          </View>
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
      {children ? <View style={styles.below}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  // Ліва група: «Назад» (коли є) + коробка заголовка. Стискається як ціле.
  lead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  titleBox: {
    flexShrink: 1,
  },
  crumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  // Кегль крихт навмисно малий: це підпис над заголовком, а не другий
  // заголовок. opacity, а не окремий колір, — щоб екранам не доводилось
  // заводити ще одну змінну палітри заради одного рядка.
  crumb: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
    opacity: 0.7,
  },
  // Явний нуль документує намір: кнопки не стискаються НІКОЛИ, інакше
  // 36pt-квадрат перетворюється на вертикальну смужку.
  actions: {
    flexDirection: 'row',
    gap: 7,
    flexShrink: 0,
  },
  // lineHeight заданий явно: без нього великий кегль обрізається зверху
  // й знизу на Android.
  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  below: {
    marginTop: 8,
  },
});
