import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import { API_BASE_URL } from '../config';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Sections'>;

export default function SectionsScreen(_props: Props) {
  const { colors } = useTheme();

  function openOhs() {
    const url = `${API_BASE_URL}/ohs`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Раздел', 'Не удалось открыть ссылку');
    });
  }

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
        onPress={openOhs}
        activeOpacity={0.75}
      >
        <Text style={[styles.rowTitle, { color: colors.text }]}>ГО и ЧС</Text>
        <Text style={[styles.rowHint, { color: colors.textMuted }]}>
          Охрана труда, гражданская оборона и чрезвычайные ситуации
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  inner: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8 },
  row: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
  },
  rowTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  rowHint: { fontSize: 13, lineHeight: 18 },
});
