import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import LogoHeader from '../components/LogoHeader';
import { useTheme } from '../context/ThemeContext';

export default function SettingsScreen() {
  const { colors, mode, setTheme } = useTheme();
  const isDark = mode === 'dark';

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
});
