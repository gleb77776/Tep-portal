import Constants from 'expo-constants';
import { Platform } from 'react-native';

type Extra = { apiBaseUrl?: string };

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/** Дефолт без app.json: web и iOS-симулятор → localhost; Android-эмулятор → 10.0.2.2. */
function defaultApiBaseUrl(): string {
  if (Platform.OS === 'web') return 'http://localhost:8000';
  if (Platform.OS === 'android') return 'http://10.0.2.2:8000';
  return 'http://localhost:8000';
}

/** Базовый URL бэкенда без завершающего /. Переопределение: app.json → expo.extra.apiBaseUrl. */
export const API_BASE_URL = String(extra.apiBaseUrl ?? defaultApiBaseUrl()).replace(/\/$/, '');
