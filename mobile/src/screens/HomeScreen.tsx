import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import LogoHeader from '../components/LogoHeader';
import { fetchUserMe, type PortalUser } from '../api/client';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';

const USERNAME_KEY = 'ad_username';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const stored = (await AsyncStorage.getItem(USERNAME_KEY))?.trim() ?? '';
    if (!stored) {
      navigation.replace('Login');
      return;
    }
    const data = await fetchUserMe(stored);
    setUser(data);
  };

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setLoading(true);
      load()
        .catch((e) => {
          if (alive) {
            Alert.alert('Профиль', e instanceof Error ? e.message : 'Ошибка загрузки');
          }
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
      return () => {
        alive = false;
      };
    }, [navigation])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (e) {
      Alert.alert('Обновление', e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setRefreshing(false);
    }
  }

  async function onLogout() {
    await AsyncStorage.removeItem(USERNAME_KEY);
    navigation.replace('Login');
  }

  if (loading && !user) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.screenBg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.muted, { color: colors.textMuted }]}>Загрузка профиля…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.screenBg }]}
      contentContainerStyle={styles.scrollInner}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <LogoHeader compact />
      <Text style={[styles.h1, { color: colors.text }]}>Добро пожаловать</Text>
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.cardBg,
            borderColor: colors.cardBorder,
          },
        ]}
      >
        <Row label="Логин" value={user?.username ?? '—'} colors={colors} />
        <Row label="ФИО" value={user?.fullName ?? '—'} colors={colors} />
        <Row label="Подразделение" value={user?.department ?? '—'} colors={colors} />
        <Row label="Почта" value={user?.email ?? '—'} colors={colors} />
      </View>
      <Text style={[styles.note, { color: colors.textMuted }]}>
        Стартовая версия приложения: тот же API, что у веб-портала. Дальше — разделы, новости, проекты.
      </Text>
      <TouchableOpacity
        style={[styles.linkBtn, { borderColor: colors.cardBorder }]}
        onPress={() => navigation.navigate('Settings')}
      >
        <Text style={[styles.linkBtnText, { color: colors.primary }]}>⚙️ Настройки и тема</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.outlineBtn, { borderColor: colors.danger }]}
        onPress={onLogout}
      >
        <Text style={[styles.outlineText, { color: colors.danger }]}>Выйти</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.textSecondary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { marginTop: 12 },
  scroll: { flex: 1 },
  scrollInner: { paddingHorizontal: 16, paddingBottom: 40 },
  h1: { fontSize: 22, fontWeight: '700', marginTop: 16, marginBottom: 14 },
  card: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    marginBottom: 16,
  },
  row: { marginBottom: 12 },
  label: { fontSize: 12, marginBottom: 4 },
  value: { fontSize: 16 },
  note: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  linkBtn: {
    borderWidth: 2,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  linkBtnText: { fontSize: 16, fontWeight: '600' },
  outlineBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  outlineText: { fontSize: 16, fontWeight: '600' },
});
