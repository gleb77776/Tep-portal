import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ThemeColors } from '../theme/colors';
import { shadowRaised } from '../theme/shadows';

type Props = {
  colors: ThemeColors;
  onOpenOhs: () => void;
  onOpenForms: () => void;
  onOpenTraining: () => void;
  onOpenAll: () => void;
};

/** Мобильные разделы: ОТ/ГО/ЧС, Бланки, обучение, все разделы — в одну строку как панель иконок на сайте. */
export default function HomeIconsBar({ colors, onOpenOhs, onOpenForms, onOpenTraining, onOpenAll }: Props) {
  const circleBg = colors.iconsIconCircleBg;
  const emojiTint = colors.iconsIconGlyph;

  return (
    <View
      style={[
        styles.panel,
        shadowRaised,
        {
          backgroundColor: colors.iconsPanelBg,
          borderColor: colors.mode === 'dark' ? colors.primaryLight : 'rgba(255, 255, 255, 0.14)',
        },
      ]}
    >
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
          onPress={onOpenTraining}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Записи с программ обучения"
        >
          <View style={[styles.iconCircle, { backgroundColor: circleBg }]}>
            <Text style={[styles.iconEmoji, { color: emojiTint }]}>🎓</Text>
          </View>
          <Text style={styles.iconTitle} numberOfLines={2}>
            ОБУЧЕНИЕ
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
    borderWidth: 1,
    paddingVertical: 15,
    paddingHorizontal: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
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
