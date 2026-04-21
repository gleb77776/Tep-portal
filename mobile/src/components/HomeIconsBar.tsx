import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ThemeColors } from '../theme/colors';

type Props = {
  colors: ThemeColors;
  onOpenOhs: () => void;
  onOpenForms: () => void;
  onOpenAll: () => void;
};

/** Только мобильные разделы: ОТ/ГО/ЧС, Бланки, Все разделы — в одну строку как панель иконок на сайте. */
export default function HomeIconsBar({ colors, onOpenOhs, onOpenForms, onOpenAll }: Props) {
  const panelBg = colors.mode === 'dark' ? colors.logoStripStart : colors.primary;
  const circleBg = '#ffffff';
  const emojiTint = colors.primary;

  return (
    <View style={[styles.panel, { backgroundColor: panelBg }]}>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.cell}
          onPress={onOpenOhs}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Охрана труда, ГО и ЧС"
        >
          <View style={[styles.iconCircle, { backgroundColor: circleBg }]}>
            <Text style={[styles.iconEmoji, { color: emojiTint }]}>📋</Text>
          </View>
          <Text style={styles.iconTitle} numberOfLines={2}>
            ОТ, ГО И ЧС
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cell}
          onPress={onOpenForms}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Бланки"
        >
          <View style={[styles.iconCircle, { backgroundColor: circleBg }]}>
            <Text style={[styles.iconEmoji, { color: emojiTint }]}>📑</Text>
          </View>
          <Text style={styles.iconTitle} numberOfLines={2}>
            БЛАНКИ
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cell}
          onPress={onOpenAll}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Все разделы"
        >
          <View style={[styles.iconCircle, { backgroundColor: circleBg }]}>
            <Text style={[styles.iconEmoji, { color: emojiTint }]}>📚</Text>
          </View>
          <Text style={styles.iconTitle} numberOfLines={2}>
            ВСЕ РАЗДЕЛЫ
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 10,
    marginHorizontal: 16,
    marginTop: 44,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  iconEmoji: {
    fontSize: 18,
  },
  iconTitle: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 12,
  },
});
