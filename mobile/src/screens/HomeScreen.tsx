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
import HomeIconsBar from '../components/HomeIconsBar';
import { fetchNews, fetchUserMe, type NewsItem, type PortalUser } from '../api/client';
import { getStoredFullNameOverride, hasIdentityAck } from '../utils/identityAckStorage';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation/types';

const USERNAME_KEY = 'ad_username';
const SNAPSHOT_KEY = 'portal_user_snapshot';
const HOME_NEWS_LIMIT = 3;
const VK_URL = 'https://vk.com/ao_tep';
const TG_URL = 'https://t.me/teploelektroproekt';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNews = async () => {
    const list = await fetchNews();
    setNews(list.slice(0, HOME_NEWS_LIMIT));
  };

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
      Promise.all([
        load().catch((e) => {
          if (alive) {
            Alert.alert('Профиль', e instanceof Error ? e.message : 'Ошибка загрузки');
          }
        }),
        loadNews().catch(() => {
          if (alive) setNews([]);
        }),
      ]).finally(() => {
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
      await Promise.all([load(), loadNews().catch(() => setNews([]))]);
    } catch (e) {
      Alert.alert('Обновление', e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setRefreshing(false);
    }
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
      <HomeIconsBar
        colors={colors}
        onOpenOhs={() => navigation.navigate('Ohs')}
        onOpenForms={() => navigation.navigate('Forms')}
        onOpenTraining={() => navigation.navigate('Training')}
        onOpenAll={() => navigation.navigate('Sections')}
      />

      <View style={styles.newsSection}>
        <Text style={[styles.newsSectionTitle, { color: colors.text }]}>Последние новости</Text>
        {news.length === 0 ? (
          <Text style={[styles.newsEmpty, { color: colors.textMuted }]}>
            Нет новостей или не удалось загрузить. Потяните вниз для обновления.
          </Text>
        ) : (
          news.map((item) => (
            <View
              key={item.id}
              style={[
                styles.newsCard,
                {
                  backgroundColor: colors.cardBg,
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              <Text style={styles.newsIcon}>{item.icon || '📄'}</Text>
              <View style={styles.newsCardBody}>
                <Text style={[styles.newsItemTitle, { color: colors.text }]}>{item.title}</Text>
                <Text style={[styles.newsDate, { color: colors.textMuted }]}>{item.date}</Text>
                {item.badge ? (
                  <View style={[styles.newsBadge, { borderColor: colors.primary }]}>
                    <Text style={[styles.newsBadgeText, { color: colors.primary }]}>{item.badge}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ))
        )}
        <Text style={[styles.newsSocialHint, { color: colors.textMuted }]}>
          Подробнее — в наших соцсетях
        </Text>
        <View style={styles.newsSocialRow}>
          <TouchableOpacity onPress={() => Linking.openURL(VK_URL)} accessibilityLabel="ВКонтакте">
            <Text style={[styles.newsSocialLink, { color: colors.primary }]}>ВК</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textMuted }}> · </Text>
          <TouchableOpacity onPress={() => Linking.openURL(TG_URL)} accessibilityLabel="Telegram">
            <Text style={[styles.newsSocialLink, { color: colors.primary }]}>Telegram</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { marginTop: 12 },
  scroll: { flex: 1 },
  scrollInner: { paddingBottom: 40 },
  newsSection: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  newsSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  newsEmpty: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  newsCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 12,
    borderWidth: 2,
    padding: 14,
    marginBottom: 12,
  },
  newsIcon: { fontSize: 26, lineHeight: 30 },
  newsCardBody: { flex: 1, minWidth: 0 },
  newsItemTitle: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  newsDate: { fontSize: 13, marginTop: 6 },
  newsBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  newsBadgeText: { fontSize: 12, fontWeight: '600' },
  newsSocialHint: { fontSize: 13, marginTop: 4, marginBottom: 6 },
  newsSocialRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  newsSocialLink: { fontSize: 14, fontWeight: '600' },
});
