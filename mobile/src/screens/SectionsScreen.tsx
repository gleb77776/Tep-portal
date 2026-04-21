import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation/types';
import { shadowCard } from '../theme/shadows';

type Props = NativeStackScreenProps<RootStackParamList, 'Sections'>;

export default function SectionsScreen({ navigation }: Props) {
  const { colors } = useTheme();

  const borderSection = colors.mode === 'light' ? colors.divider : colors.cardBorder;
  const iconRingBg = colors.mode === 'light' ? '#e6f0ff' : colors.inputBg;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.screenBg }]}
      contentContainerStyle={styles.inner}
    >
      <TouchableOpacity
        style={[
          styles.row,
          shadowCard,
          {
            backgroundColor: colors.sectionTileBg,
            borderColor: borderSection,
          },
        ]}
        onPress={() => navigation.navigate('Ohs')}
        activeOpacity={0.75}
      >
        <View style={[styles.rowIconWrap, { backgroundColor: iconRingBg, borderColor: colors.cardBorder }]}>
          <Text style={styles.rowEmoji}>📋</Text>
        </View>
        <View style={styles.rowTextCol}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>ГО и ЧС</Text>
          <Text style={[styles.rowHint, { color: colors.textMuted }]}>
            Охрана труда, гражданская оборона и чрезвычайные ситуации
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.row,
          shadowCard,
          {
            backgroundColor: colors.sectionTileBg,
            borderColor: borderSection,
          },
        ]}
        onPress={() => navigation.navigate('Forms')}
        activeOpacity={0.75}
      >
        <View style={[styles.rowIconWrap, { backgroundColor: iconRingBg, borderColor: colors.cardBorder }]}>
          <Text style={styles.rowEmoji}>📑</Text>
        </View>
        <View style={styles.rowTextCol}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>Бланки</Text>
          <Text style={[styles.rowHint, { color: colors.textMuted }]}>
            Документы и шаблоны раздела «Бланки»
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.row,
          shadowCard,
          {
            backgroundColor: colors.sectionTileBg,
            borderColor: borderSection,
          },
        ]}
        onPress={() => navigation.navigate('Training')}
        activeOpacity={0.75}
      >
        <View style={[styles.rowIconWrap, { backgroundColor: iconRingBg, borderColor: colors.cardBorder }]}>
          <Text style={styles.rowEmoji}>🎓</Text>
        </View>
        <View style={styles.rowTextCol}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>Записи с программ обучения</Text>
          <Text style={[styles.rowHint, { color: colors.textMuted }]}>
            Материалы и видео раздела «Обучение»
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.row,
          shadowCard,
          {
            backgroundColor: colors.sectionTileBg,
            borderColor: borderSection,
          },
        ]}
        onPress={() => navigation.navigate('Sro')}
        activeOpacity={0.75}
      >
        <View style={[styles.rowIconWrap, { backgroundColor: iconRingBg, borderColor: colors.cardBorder }]}>
          <Text style={styles.rowEmoji}>📁</Text>
        </View>
        <View style={styles.rowTextCol}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>СРО</Text>
          <Text style={[styles.rowHint, { color: colors.textMuted }]}>
            Документы саморегулируемых организаций
          </Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  inner: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 12, gap: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 14,
    minHeight: 88,
  },
  rowIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowEmoji: { fontSize: 22 },
  rowTextCol: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  rowHint: { fontSize: 13, lineHeight: 18 },
});
