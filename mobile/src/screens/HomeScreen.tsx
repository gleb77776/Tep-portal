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
        <Text style={[styles.muted, { color: colors.textMuted }]}>Загрузка…</Text>
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
      <LogoHeader compact fullBleed />
      <View style={styles.sectionsStrip}>
        <TouchableOpacity
          style={[
            styles.sectionCard,
            { backgroundColor: colors.logoStripStart },
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { marginTop: 12 },
  scroll: { flex: 1 },
  scrollInner: { paddingBottom: 40 },
  sectionsStrip: {
    width: '100%',
    marginTop: 44,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
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
});
