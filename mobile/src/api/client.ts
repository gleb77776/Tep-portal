import { API_BASE_URL } from '../config';

export type PortalUser = {
  username?: string;
  /** Как в ответе Go: json fullName */
  fullName?: string;
  email?: string;
  department?: string;
};

export async function loginAd(username: string, password: string): Promise<PortalUser> {
  const res = await fetch(`${API_BASE_URL}/api/v1/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username: username.trim(), password }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & PortalUser;
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `Ошибка входа (${res.status})`);
  }
  return data;
}

export async function fetchUserMe(username: string): Promise<PortalUser> {
  const q = encodeURIComponent(username.trim());
  const res = await fetch(`${API_BASE_URL}/api/v1/user/me?username=${q}`, {
    headers: { Accept: 'application/json' },
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & PortalUser;
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `Профиль (${res.status})`);
  }
  return data;
}
