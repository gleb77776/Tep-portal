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
import { fetchUserMe, type PortalUser } from '../api/client';
import type { RootStackParamList } from '../navigation/types';

const USERNAME_KEY = 'ad_username';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
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
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.muted}>Загрузка профиля…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.h1}>Добро пожаловать</Text>
      <View style={styles.card}>
        <Row label="Логин" value={user?.username ?? '—'} />
        <Row label="ФИО" value={user?.fullName ?? '—'} />
        <Row label="Подразделение" value={user?.department ?? '—'} />
        <Row label="Почта" value={user?.email ?? '—'} />
      </View>
      <Text style={styles.note}>
        Это стартовая версия приложения: тот же API, что и у веб-портала. Дальше — разделы, новости,
        проекты и документы.
      </Text>
      <TouchableOpacity style={styles.outlineBtn} onPress={onLogout}>
        <Text style={styles.outlineText}>Выйти</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f4f6f8' },
  muted: { marginTop: 12, color: '#666' },
  scroll: { padding: 20, paddingBottom: 40 },
  h1: { fontSize: 24, fontWeight: '700', marginBottom: 16, color: '#1a1a1a' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8ecf0',
    marginBottom: 16,
  },
  row: { marginBottom: 12 },
  label: { fontSize: 12, color: '#666', marginBottom: 4 },
  value: { fontSize: 16, color: '#111' },
  note: { fontSize: 14, color: '#555', lineHeight: 20, marginBottom: 24 },
  outlineBtn: {
    borderWidth: 1,
    borderColor: '#c00',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  outlineText: { color: '#c00', fontSize: 16, fontWeight: '600' },
});
