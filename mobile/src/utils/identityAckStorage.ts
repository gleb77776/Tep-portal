import AsyncStorage from '@react-native-async-storage/async-storage';

const LIST_KEY = 'tep_identity_ack_users';

function norm(u: string) {
  return u.trim().toLowerCase();
}

async function readList(): Promise<string[]> {
  try {
    const s = await AsyncStorage.getItem(LIST_KEY);
    const a = s ? JSON.parse(s) : [];
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

export async function hasIdentityAck(username: string): Promise<boolean> {
  const u = norm(username);
  if (!u) return true;
  const list = await readList();
  return list.includes(u);
}

export async function setIdentityAck(username: string): Promise<void> {
  const u = norm(username);
  if (!u) return;
  const list = await readList();
  if (list.includes(u)) return;
  list.push(u);
  await AsyncStorage.setItem(LIST_KEY, JSON.stringify(list));
}

export function fullNameOverrideKey(username: string) {
  return `tep_fullname_override_${norm(username)}`;
}

export async function getStoredFullNameOverride(username: string): Promise<string> {
  const v = await AsyncStorage.getItem(fullNameOverrideKey(username));
  return typeof v === 'string' ? v.trim() : '';
}

export async function setStoredFullNameOverride(username: string, fullName: string): Promise<void> {
  const u = norm(username);
  if (!u) return;
  const t = fullName.trim();
  const k = fullNameOverrideKey(username);
  if (t === '') await AsyncStorage.removeItem(k);
  else await AsyncStorage.setItem(k, t);
}

export async function clearStoredFullNameOverride(username: string): Promise<void> {
  await AsyncStorage.removeItem(fullNameOverrideKey(username));
}
