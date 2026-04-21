import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import LogoHeader from '../components/LogoHeader';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation/types';

const USERNAME_KEY = 'ad_username';
const SNAPSHOT_KEY = 'portal_user_snapshot';

export default function SettingsScreen() {
  const { colors, mode, setTheme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isDark = mode === 'dark';

  async function onLogout() {
    await AsyncStorage.multiRemove([USERNAME_KEY, SNAPSHOT_KEY]);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }

  function confirmLogout() {
    Alert.alert('Выход', 'Выйти из аккаунта?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: () => void onLogout() },
    ]);
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.screenBg }]}
      contentContainerStyle={styles.content}
    >
      <LogoHeader compact />
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.cardBg,
            borderColor: colors.cardBorder,
          },
        ]}
      >
        <View
          style={[
            styles.cardHead,
            {
              backgroundColor: colors.settingsHeaderBg,
              borderBottomColor: colors.inputBorder,
            },
          ]}
        >
          <Text style={styles.cardIcon}>🌓</Text>
          <Text
            style={[
              styles.cardTitle,
              { color: mode === 'dark' ? colors.primaryLight : colors.primary },
            ]}
          >
            Тема оформления
          </Text>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Тёмная тема</Text>
            <Switch
              value={isDark}
              onValueChange={(v) => setTheme(v ? 'dark' : 'light')}
              trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
              thumbColor={colors.switchThumb}
            />
          </View>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Включите тёмную тему для работы при слабом освещении (как на веб-портале)
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.logoutBtn, { borderColor: colors.danger }]}
        onPress={confirmLogout}
        activeOpacity={0.85}
      >
        <Text style={[styles.logoutText, { color: colors.danger }]}>Выйти</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 32 },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
  },
  cardIcon: { fontSize: 24 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardBody: { padding: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: { fontSize: 15 },
  hint: { fontSize: 13, lineHeight: 18 },
  logoutBtn: {
    marginHorizontal: 16,
    marginTop: 24,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: { fontSize: 16, fontWeight: '600' },
});
