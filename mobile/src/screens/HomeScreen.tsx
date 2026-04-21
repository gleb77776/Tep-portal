import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import { API_BASE_URL } from '../config';
import { getStoredFullNameOverride, hasIdentityAck } from '../utils/identityAckStorage';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';

const USERNAME_KEY = 'ad_username';
const SNAPSHOT_KEY = 'portal_user_snapshot';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const stored = (await AsyncStorage.getItem(USERNAME_KEY))?.trim() ?? '';
    if (!stored) {
      const snap = await AsyncStorage.getItem(SNAPSHOT_KEY);
      if (snap) {
        navigation.replace('IdentityWelcome');
        return;
      }
      navigation.replace('Login');
      return;
    }
    if (!(await hasIdentityAck(stored))) {
      navigation.replace('IdentityWelcome');
      return;
    }
    const data = await fetchUserMe(stored);
    const ov = await getStoredFullNameOverride(stored);
    if (ov) data.fullName = ov;
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
    await AsyncStorage.multiRemove([USERNAME_KEY, SNAPSHOT_KEY]);
    navigation.replace('Login');
  }

  function openOhs() {
    const url = `${API_BASE_URL}/ohs`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Раздел', 'Не удалось открыть ссылку');
    });
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
      <LogoHeader compact fullBleed subtitle="Корпоративный портал" />
      <View style={styles.sectionsStrip}>
        <TouchableOpacity
          style={[
            styles.sectionCard,
            {
              backgroundColor: colors.mode === 'dark' ? '#1a3a66' : colors.primary,
              borderColor: 'rgba(255,255,255,0.12)',
            },
          ]}
          onPress={openOhs}
          activeOpacity={0.85}
        >
          <View
            style={[
              styles.sectionIconCircle,
              { backgroundColor: colors.mode === 'dark' ? colors.cardBg : '#ffffff' },
            ]}
          >
            <Text style={[styles.sectionIconEmoji, { color: colors.primary }]}>📋</Text>
          </View>
          <Text style={styles.sectionCardText}>Охрана труда, ГО и ЧС</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.body}>
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
        <TouchableOpacity
          style={[styles.outlineBtn, { borderColor: colors.danger }]}
          onPress={onLogout}
        >
          <Text style={[styles.outlineText, { color: colors.danger }]}>Выйти</Text>
        </TouchableOpacity>
      </View>
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
  scrollInner: { paddingBottom: 40 },
  body: { paddingHorizontal: 16 },
  sectionsStrip: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  sectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionIconEmoji: { fontSize: 20 },
  sectionCardText: {
    flex: 1,
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 18,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    marginBottom: 16,
  },
  row: { marginBottom: 12 },
  label: { fontSize: 12, marginBottom: 4 },
  value: { fontSize: 16 },
  outlineBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  outlineText: { fontSize: 16, fontWeight: '600' },
});
