/**
 * store/registration.ts — заявка на реєстрацію в режимі workspace «за
 * погодженням» (контракт §2.4, §2.5, §9.1).
 *
 * `request_token` живе в SecureStore (`flowi_registration_token`), не в
 * AsyncStorage: це секрет, який дає прочитати рішення адміна й отримати
 * токени доступу — той самий рівень захисту, що й `flowi_access`/`flowi_refresh`.
 */
import * as SecureStore from 'expo-secure-store';

import { apiFetch } from './api';
import { loadData, saveData } from './storage';

const PENDING_KEY = 'pending_registration';
const TOKEN_SECURE_KEY = 'flowi_registration_token';

export interface PendingRegistration {
  requestId: string;
  email: string;
  workspaceId: string;
  createdAt: number;
}

export async function getPendingRegistration(): Promise<PendingRegistration | null> {
  return loadData<PendingRegistration | null>(PENDING_KEY, null);
}

export async function savePendingRegistration(
  pending: PendingRegistration,
  requestToken: string,
): Promise<void> {
  await saveData(PENDING_KEY, pending);
  await SecureStore.setItemAsync(TOKEN_SECURE_KEY, requestToken);
}

export async function clearPendingRegistration(): Promise<void> {
  await saveData(PENDING_KEY, null);
  await SecureStore.deleteItemAsync(TOKEN_SECURE_KEY);
}

export interface RegistrationStatusResult {
  status: 'pending' | 'approved' | 'rejected';
  detail?: string;
  reject_reason?: string | null;
  decided_at?: string | null;
  user?: { id: number | string; email: string; name: string; is_admin?: boolean } | null;
  access?: string | null;
  refresh?: string | null;
}

/**
 * Опитує стан заявки — контракт §2.5. Токени доступу повертаються сервером
 * ЛИШЕ один раз (перше читання `approved`): якщо `approved` прийшов без
 * `access`/`refresh`, застосунок показує звичайну форму входу.
 */
export async function pollRegistrationStatus(requestId: string): Promise<RegistrationStatusResult> {
  const token = await SecureStore.getItemAsync(TOKEN_SECURE_KEY);
  if (!token) {
    throw new Error('registration_token_missing');
  }
  return apiFetch<RegistrationStatusResult>('/auth/register/status/', {
    method: 'POST',
    body: { request_id: requestId, request_token: token },
    auth: false,
    allowOffline: true,
  });
}
