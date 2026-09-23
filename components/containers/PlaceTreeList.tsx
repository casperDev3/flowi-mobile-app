import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import {
  buildPlaceTree,
  containerColor,
  descendantPlaceIds,
  type Container,
  type ContainerPlace,
  type ContainerStats,
  type PlaceNode,
} from '@/utils/containers';

import { itemsCount, placeKindIcon } from './i18n';
import type { ContainersColors } from './theme';

export const NO_PLACE = '__none__';

/**
 * Дерево місць.
 *
 * `mode="nested"` — телефон/середній планшет: дерево, що згортається, з
 * коробками всередині кожного місця (кімната → меблі → полиця → коробки).
 * `mode="column"` — ліва колонка на широкому планшеті: лише місця з
 * лічильниками; вибір фільтрує сітку праворуч (§8.2).
 */
export function PlaceTreeList({
  places, containers, statsFor, c, accent, mode, selected, onSelect, onOpenBox, onEditPlace, onAddPlace,
}: {
  places: readonly ContainerPlace[];
  containers: readonly Container[];
  statsFor: (id: string) => ContainerStats;
  c: ContainersColors;
  accent: string;
  mode: 'nested' | 'column';
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  onOpenBox: (id: string) => void;
  onEditPlace: (place: ContainerPlace) => void;
  onAddPlace: (parentId: string | null) => void;
}) {
  const { tr, lang } = useI18n();
  const tree = useMemo(() => buildPlaceTree(places), [places]);
  const known = useMemo(() => new Set(places.map(p => p.id)), [places]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const boxesByPlace = useMemo(() => {
    const out = new Map<string, Container[]>();
    for (const box of containers) {
      const key = box.placeId && known.has(box.placeId) ? box.placeId : NO_PLACE;
      out.set(key, [...(out.get(key) ?? []), box]);
    }
    return out;
  }, [containers, known]);
  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const place of places) {
      const ids = descendantPlaceIds(place.id, places);
      out.set(place.id, containers.filter(box => box.placeId && ids.has(box.placeId)).length);
    }
    return out;
  }, [places, containers]);

  const toggle = (id: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const boxRow = (box: Container, depth: number) => {
    const color = containerColor(box.color);
    const stats = statsFor(box.id);
    return (
      <TouchableOpacity key={box.id} onPress={() => onOpenBox(box.id)} accessibilityRole="button"
        accessibilityLabel={`${box.name}, ${itemsCount(tr, stats.count, lang)}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingLeft: 12 + depth * 16, paddingRight: 12 }}>
        <IconSymbol name="shippingbox.fill" size={14} color={color} />
        <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: '600' }}>{box.name}</Text>
        <Text style={{ color: c.sub, fontSize: 12 }}>{stats.count}</Text>
        <IconSymbol name="chevron.right" size={11} color={c.sub} />
      </TouchableOpacity>
    );
  };

  const placeRow = (node: PlaceNode) => {
    const open = !collapsed.has(node.place.id);
    const boxes = boxesByPlace.get(node.place.id) ?? [];
    const expandable = node.children.length > 0 || (mode === 'nested' && boxes.length > 0);
    const active = mode === 'column' && selected === node.place.id;
    return (
      <View key={node.place.id}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 4 + node.depth * 16, borderRadius: 10,
          backgroundColor: active ? accent + '22' : 'transparent' }}>
          <TouchableOpacity onPress={() => expandable && toggle(node.place.id)} disabled={!expandable}
            accessibilityRole="button" accessibilityState={{ expanded: expandable ? open : undefined }}
            accessibilityLabel={node.place.name}
            style={{ width: 32, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            {expandable ? <IconSymbol name={open ? 'chevron.down' : 'chevron.right'} size={12} color={c.sub} /> : null}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => (mode === 'column' ? onSelect?.(node.place.id) : toggle(node.place.id))}
            onLongPress={() => onEditPlace(node.place)} accessibilityRole="button"
            accessibilityHint={tr.ctrPlaceEdit} accessibilityState={{ selected: active }}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
            <IconSymbol name={placeKindIcon(node.place.kind)} size={14} color={active ? accent : c.sub} />
            <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: '700' }}>{node.place.name}</Text>
            <Text style={{ color: c.sub, fontSize: 12 }}>{counts.get(node.place.id) ?? 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onEditPlace(node.place)} accessibilityRole="button"
            accessibilityLabel={`${tr.ctrPlaceEdit}: ${node.place.name}`}
            style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <IconSymbol name="pencil" size={12} color={c.sub} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onAddPlace(node.place.id)} accessibilityRole="button"
            accessibilityLabel={`${tr.ctrPlaceCreateHere}: ${node.place.name}`}
            style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <IconSymbol name="plus" size={13} color={c.sub} />
          </TouchableOpacity>
        </View>
        {open ? (
          <>
            {node.children.map(placeRow)}
            {mode === 'nested' ? boxes.map(box => boxRow(box, node.depth + 1)) : null}
          </>
        ) : null}
      </View>
    );
  };

  const unplaced = boxesByPlace.get(NO_PLACE) ?? [];
  const header = (label: string, id: string | null, count: number) => {
    const active = selected === id;
    return (
      <TouchableOpacity onPress={() => onSelect?.(id)} accessibilityRole="button" accessibilityState={{ selected: active }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 10,
          backgroundColor: active ? accent + '22' : 'transparent' }}>
        <Text style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: '700' }}>{label}</Text>
        <Text style={{ color: c.sub, fontSize: 12 }}>{count}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, marginBottom: 4 }}>
        <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{tr.ctrPlaces}</Text>
        <TouchableOpacity onPress={() => onAddPlace(null)} accessibilityRole="button" accessibilityLabel={tr.ctrPlaceNew}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 8 }}>
          <IconSymbol name="plus" size={13} color={accent} />
          <Text style={{ color: accent, fontSize: 13, fontWeight: '700' }}>{tr.ctrPlaceNew}</Text>
        </TouchableOpacity>
      </View>
      {mode === 'column' ? header(tr.ctrAllBoxes, null, containers.length) : null}
      {tree.length ? tree.map(placeRow) : (
        <Text style={{ color: c.sub, fontSize: 13, paddingHorizontal: 12, paddingVertical: 10 }}>{tr.ctrPlacesEmpty}</Text>
      )}
      {unplaced.length ? (
        mode === 'column' ? header(tr.ctrNoPlace, NO_PLACE, unplaced.length) : (
          <View style={{ marginTop: 6 }}>
            <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 6 }}>{tr.ctrNoPlace}</Text>
            {unplaced.map(box => boxRow(box, 0))}
          </View>
        )
      ) : null}
    </View>
  );
}
