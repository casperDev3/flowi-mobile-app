/**
 * components/feedback/labels.ts — підписи й кольори екрана «Ідеї та баги».
 *
 * Лише відображення ключів моделі на рядки словника (`store/translations.ts`,
 * префікс `fb`) і на кольори. Жодного тексту тут не вшито.
 */
import { moduleLabelKey, type ModuleId } from '@/constants/nav';
import type { Translations } from '@/store/translations';

import type {
  AttachmentState,
  BugSeverity,
  FeedbackContext,
  FeedbackKind,
  FeedbackStateKey,
  IdeaPriority,
  RequiredField,
} from './model';

export const KIND_COLOR: Record<FeedbackKind, string> = { idea: '#8B5CF6', bug: '#EF4444' };
export const DONE_COLOR = '#10B981';

export const SEVERITY_STYLE: Record<BugSeverity, { color: string; icon: string }> = {
  critical: { color: '#EF4444', icon: 'exclamationmark.triangle.fill' },
  major:    { color: '#F59E0B', icon: 'exclamationmark.circle.fill' },
  minor:    { color: '#6366F1', icon: 'info.circle.fill' },
};

export const PRIORITY_STYLE: Record<IdeaPriority, { color: string; icon: string }> = {
  high:   { color: '#8B5CF6', icon: 'bolt.fill' },
  medium: { color: '#0EA5E9', icon: 'circle.fill' },
  low:    { color: '#6B7280', icon: 'clock.fill' },
};

export function weightStyle(kind: FeedbackKind, weight: string): { color: string; icon: string } {
  return kind === 'bug'
    ? SEVERITY_STYLE[weight as BugSeverity] ?? SEVERITY_STYLE.major
    : PRIORITY_STYLE[weight as IdeaPriority] ?? PRIORITY_STYLE.medium;
}

export function weightLabel(tr: Translations, kind: FeedbackKind, weight: string): string {
  if (kind === 'bug') {
    if (weight === 'critical') return tr.fbSevCritical;
    if (weight === 'minor') return tr.fbSevMinor;
    return tr.fbSevMajor;
  }
  if (weight === 'high') return tr.fbPrioHigh;
  if (weight === 'low') return tr.fbPrioLow;
  return tr.fbPrioMedium;
}

export function platformLabel(tr: Translations, platform: string): string {
  if (platform === 'mobile') return tr.fbAffectsMobile;
  if (platform === 'tablet') return tr.fbAffectsTablet;
  if (platform === 'web') return tr.fbAffectsWeb;
  return platform;
}

export function platformsLabel(tr: Translations, platforms: readonly string[] | undefined): string {
  return (platforms ?? []).map(p => platformLabel(tr, p)).join(', ');
}

export function moduleLabel(tr: Translations, module: string | undefined): string {
  if (!module) return tr.fbModuleNone;
  if (module === 'other') return tr.fbModuleOther;
  if (module === 'sync') return tr.fbModuleSync;
  if (module === 'auth') return tr.fbModuleAuth;
  const key = moduleLabelKey(module as ModuleId);
  const label = key ? tr[key] : undefined;
  return typeof label === 'string' ? label : module;
}

export const STATE_COLOR: Record<FeedbackStateKey, string> = {
  draft: '#6B7280',
  queued: '#F59E0B',
  sent: '#0EA5E9',
  sentNew: '#0EA5E9',
  inProgress: '#6366F1',
  done: '#10B981',
  rejected: '#EF4444',
  failed: '#EF4444',
  undelivered: '#EF4444',
  localOnly: '#6B7280',
  legacy: '#6B7280',
};

export function stateLabel(tr: Translations, key: FeedbackStateKey): string {
  switch (key) {
    case 'draft': return tr.fbStateDraft;
    case 'queued': return tr.fbStateQueued;
    case 'sent': return tr.fbStateSent;
    case 'sentNew': return tr.fbStateSentNew;
    case 'inProgress': return tr.fbStateInProgress;
    case 'done': return tr.fbStateDone;
    case 'rejected': return tr.fbStateRejected;
    case 'failed': return tr.fbStateFailed;
    case 'undelivered': return tr.fbStateUndelivered;
    case 'localOnly': return tr.fbStateLocalOnly;
    case 'legacy': return tr.fbStateLegacy;
  }
}

export function requiredFieldLabel(tr: Translations, field: RequiredField): string {
  switch (field) {
    case 'title': return tr.fbFieldTitle;
    case 'description': return tr.fbFieldDescription;
    case 'steps': return tr.fbFieldSteps;
    case 'expected': return tr.fbFieldExpected;
    case 'actual': return tr.fbFieldActual;
  }
}

export function attachmentStateLabel(tr: Translations, state: AttachmentState, hasLocalFile: boolean): string {
  if (state === 'uploaded') return tr.fbAttachUploaded;
  if (state === 'failed') return tr.fbAttachFailed;
  return hasLocalFile ? tr.fbAttachLocal : tr.fbAttachElsewhere;
}

export function deviceLabel(tr: Translations, device: FeedbackContext['deviceType']): string {
  if (device === 'tablet') return tr.fbDeviceTablet;
  if (device === 'desktop') return tr.fbDeviceDesktop;
  return tr.fbDevicePhone;
}

/** Рядки таблиці контексту (§10.3) у порядку показу. */
export function contextRows(tr: Translations, ctx: FeedbackContext): { label: string; value: string }[] {
  const rows = [
    { label: tr.fbCtxPlatform, value: ctx.platform === 'web' ? tr.fbPlatformWeb : tr.fbPlatformMobile },
    { label: tr.fbCtxDevice, value: deviceLabel(tr, ctx.deviceType) },
    { label: tr.fbCtxVersion, value: ctx.appVersion },
    { label: tr.fbCtxOs, value: ctx.osVersion ?? '' },
    { label: tr.fbCtxScreen, value: ctx.screen },
    { label: tr.fbCtxWorkspace, value: ctx.workspace ?? '' },
  ];
  return rows.filter(row => row.value);
}

export function formatBytes(bytes: number, tr: Translations): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return tr.fbUnitMb.replace('{n}', mb.toFixed(mb >= 10 ? 0 : 1));
  return tr.fbUnitKb.replace('{n}', String(Math.max(1, Math.round(bytes / 1024))));
}
