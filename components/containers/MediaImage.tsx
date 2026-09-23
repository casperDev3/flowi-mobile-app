import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import type { MediaAsset } from '@/utils/containers';

import { localMediaUri, remoteMediaSource } from './media';

/**
 * Фото з локального файлу (якщо воно зняте тут) або з сервера з токеном.
 * Поки байти не доїхали з іншого пристрою — плейсхолдер «ще вивантажується»,
 * а не порожнє місце (§5.4). Кеш — за sha256 (`cacheKey`), не за id.
 */
export function MediaImage({
  asset,
  style,
  full = false,
  pendingLabel,
  placeholderColor,
}: {
  asset: MediaAsset | undefined;
  style: StyleProp<ViewStyle>;
  full?: boolean;
  pendingLabel: string;
  placeholderColor: string;
}) {
  const local = localMediaUri(asset?.sha256);
  const [remote, setRemote] = useState<{ uri: string; headers: Record<string, string> } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!asset || local) return;
    void remoteMediaSource(asset, full).then(source => { if (alive) setRemote(source); });
    return () => { alive = false; };
  }, [asset, local, full]);

  const source = local
    ? { uri: local }
    : remote && !failed
      ? { uri: remote.uri, headers: remote.headers, cacheKey: `${asset?.sha256 ?? asset?.id}:${full ? 'full' : 'thumb'}` }
      : null;

  if (!source) {
    return (
      <View style={[style, { alignItems: 'center', justifyContent: 'center', backgroundColor: placeholderColor }]}
        accessible accessibilityRole="image" accessibilityLabel={pendingLabel}>
        <IconSymbol name="icloud.slash" size={16} color="rgba(128,128,128,0.9)" />
      </View>
    );
  }
  return (
    <Image
      source={source}
      style={style as never}
      contentFit={full ? 'contain' : 'cover'}
      cachePolicy="disk"
      transition={120}
      onError={() => setFailed(true)}
      accessibilityIgnoresInvertColors
    />
  );
}
