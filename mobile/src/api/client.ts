import { API_BASE_URL } from '../config';

export type PortalUser = {
  username?: string;
  /** Как в ответе Go: json fullName */
  fullName?: string;
  email?: string;
  department?: string;
};

/** Как `handlers.NewsItem` и главная сайта */
export type NewsItem = {
  id: number;
  icon: string;
  title: string;
  date: string;
  badge?: string | null;
};

/** Публичный список новостей (тот же источник, что и веб `/api/v1/news`). */
export async function fetchNews(): Promise<NewsItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/news`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => null)) as unknown;
  return Array.isArray(data) ? (data as NewsItem[]) : [];
}

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

/** Раздел «Охрана труда, ГО и ЧС» — как `handlers.ListOT` и OhsPage.jsx */
export type OtFolderEntry = { name: string };
export type OtFileEntry = { name: string; ext: string };

export type OtListResponse = {
  path?: string;
  folders?: OtFolderEntry[];
  files?: OtFileEntry[];
  error?: string;
};

export async function fetchOtList(relPath: string): Promise<OtListResponse> {
  const p = relPath === '' ? '.' : relPath;
  const res = await fetch(`${API_BASE_URL}/api/v1/ot/list?path=${encodeURIComponent(p)}`, {
    headers: { Accept: 'application/json' },
  });
  let data: OtListResponse = {};
  try {
    data = (await res.json()) as OtListResponse;
  } catch {
    return { error: 'Некорректный ответ сервера' };
  }
  if (!res.ok) {
    return { error: typeof data.error === 'string' ? data.error : `Ошибка ${res.status}` };
  }
  if (data.error) return data;
  return {
    path: data.path ?? p,
    folders: Array.isArray(data.folders) ? data.folders : [],
    files: Array.isArray(data.files) ? data.files : [],
  };
}

/** Статика `/ot/files/...` — как `buildFileUrl` на сайте (сегменты закодированы). */
export function buildOtFileDownloadUrl(relPath: string, fileName: string): string {
  const parts =
    relPath === '.' || relPath === '' ? [fileName] : [...relPath.split('/').filter(Boolean), fileName];
  return `${API_BASE_URL}/ot/files/${parts.map((s) => encodeURIComponent(s)).join('/')}`;
}

/** Раздел «Бланки» — тот же контент, что на сайте `/forms`: `handlers.ListForms`, статика `/forms/files/`. */
export async function fetchFormsList(relPath: string): Promise<OtListResponse> {
  const p = relPath === '' ? '.' : relPath;
  const res = await fetch(`${API_BASE_URL}/api/v1/forms/list?path=${encodeURIComponent(p)}`, {
    headers: { Accept: 'application/json' },
  });
  let data: OtListResponse = {};
  try {
    data = (await res.json()) as OtListResponse;
  } catch {
    return { error: 'Некорректный ответ сервера' };
  }
  if (!res.ok) {
    return { error: typeof data.error === 'string' ? data.error : `Ошибка ${res.status}` };
  }
  if (data.error) return data;
  return {
    path: data.path ?? p,
    folders: Array.isArray(data.folders) ? data.folders : [],
    files: Array.isArray(data.files) ? data.files : [],
  };
}

/** Статика `/forms/files/...` — как FormsPage.jsx */
export function buildFormsFileDownloadUrl(relPath: string, fileName: string): string {
  const parts =
    relPath === '.' || relPath === '' ? [fileName] : [...relPath.split('/').filter(Boolean), fileName];
  return `${API_BASE_URL}/forms/files/${parts.map((s) => encodeURIComponent(s)).join('/')}`;
}
