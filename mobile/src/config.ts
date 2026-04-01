import Constants from 'expo-constants';

type Extra = { apiBaseUrl?: string };

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/** Базовый URL бэкенда без завершающего /. Android-эмулятор: 10.0.2.2 → localhost хоста. */
export const API_BASE_URL = String(extra.apiBaseUrl ?? 'http://10.0.2.2:8000').replace(/\/$/, '');
