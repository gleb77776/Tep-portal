import { Platform, type ViewStyle } from 'react-native';

/** Как `.news-section` / карточки: 0 4px 12px rgba(0,0,0,0.05) */
export const shadowCard: ViewStyle =
  Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
    },
    android: { elevation: 4 },
    default: {},
  }) ?? {};

/** Как `.home-icons-panel`: 0 8px 24px rgba(0,0,0,0.12) */
export const shadowRaised: ViewStyle =
  Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
    },
    android: { elevation: 8 },
    default: {},
  }) ?? {};

/** Лёгкая тень для строк списка — как hover-карточка на сайте */
export const shadowRow: ViewStyle =
  Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
    },
    android: { elevation: 2 },
    default: {},
  }) ?? {};
