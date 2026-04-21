import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Sections'>;

export default function SectionsScreen({ navigation }: Props) {
  const { colors } = useTheme();

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.screenBg }]}
      contentContainerStyle={styles.inner}
    >
      <TouchableOpacity
        style={[
          styles.row,
          {
            backgroundColor: colors.cardBg,
            borderColor: colors.cardBorder,
          },
        ]}
        onPress={() => navigation.navigate('Ohs')}
        activeOpacity={0.75}
      >
        <Text style={[styles.rowTitle, { color: colors.text }]}>ГО и ЧС</Text>
        <Text style={[styles.rowHint, { color: colors.textMuted }]}>
          Охрана труда, гражданская оборона и чрезвычайные ситуации
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.row,
          {
            backgroundColor: colors.cardBg,
            borderColor: colors.cardBorder,
          },
        ]}
        onPress={() => navigation.navigate('Forms')}
        activeOpacity={0.75}
      >
        <Text style={[styles.rowTitle, { color: colors.text }]}>Бланки</Text>
        <Text style={[styles.rowHint, { color: colors.textMuted }]}>
          Документы и шаблоны раздела «Бланки» (как на сайте /forms)
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.row,
          {
            backgroundColor: colors.cardBg,
            borderColor: colors.cardBorder,
          },
        ]}
        onPress={() => navigation.navigate('Training')}
        activeOpacity={0.75}
      >
        <Text style={[styles.rowTitle, { color: colors.text }]}>Записи с программ обучения</Text>
        <Text style={[styles.rowHint, { color: colors.textMuted }]}>
          Материалы и видео раздела «Обучение» (как на сайте /training)
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.row,
          {
            backgroundColor: colors.cardBg,
            borderColor: colors.cardBorder,
          },
        ]}
        onPress={() => navigation.navigate('Sro')}
        activeOpacity={0.75}
      >
        <Text style={[styles.rowTitle, { color: colors.text }]}>СРО</Text>
        <Text style={[styles.rowHint, { color: colors.textMuted }]}>
          Документы саморегулируемых организаций (как на сайте /s/sro)
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  inner: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8, gap: 12 },
  row: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
  },
  rowTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  rowHint: { fontSize: 13, lineHeight: 18 },
});
