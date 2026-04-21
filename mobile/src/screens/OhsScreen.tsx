import { useCallback, useEffect, useState } from 'react';
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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { buildOtFileDownloadUrl, fetchOtList, type OtFileEntry, type OtFolderEntry } from '../api/client';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';

const PREVIEW_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];

type Props = NativeStackScreenProps<RootStackParamList, 'Ohs'>;

export default function OhsScreen(_props: Props) {
  const { colors } = useTheme();
  const [path, setPath] = useState('.');
  const [folders, setFolders] = useState<OtFolderEntry[]>([]);
  const [files, setFiles] = useState<OtFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyList = useCallback((data: Awaited<ReturnType<typeof fetchOtList>>) => {
    if (data.error) {
      setError(data.error);
      setFolders([]);
      setFiles([]);
      return;
    }
    setError(null);
    setFolders(data.folders ?? []);
    setFiles(data.files ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchOtList(path)
      .then((data) => {
        if (cancelled) return;
        applyList(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Ошибка загрузки');
          setFolders([]);
          setFiles([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, applyList]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      const data = await fetchOtList(path);
      applyList(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setFolders([]);
      setFiles([]);
    } finally {
      setRefreshing(false);
    }
  }

  const breadcrumbs = path === '.' ? [] : path.split('/').filter(Boolean);

  function goRoot() {
    setPath('.');
  }

  function goToCrumb(segment: string) {
    const idx = breadcrumbs.indexOf(segment);
    if (idx === -1) return;
    setPath(breadcrumbs.slice(0, idx + 1).join('/'));
  }

  function openFolder(name: string) {
    setPath(path === '.' ? name : `${path}/${name}`);
  }

  function fileUrl(name: string) {
    return buildOtFileDownloadUrl(path, name);
  }

  function canPreview(name: string) {
    const ext = (name || '').split('.').pop()?.toLowerCase() ?? '';
    return PREVIEW_EXT.includes(ext);
  }

  function openFileUrl(name: string) {
    const url = fileUrl(name);
    Linking.openURL(url).catch(() => {
      Alert.alert('Файл', 'Не удалось открыть ссылку');
    });
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
      <Text style={[styles.pageTitle, { color: colors.text }]}>
        Охрана труда, гражданская оборона и чрезвычайные ситуации
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.breadcrumbScroll}>
        <View style={styles.breadcrumbRow}>
          <TouchableOpacity onPress={goRoot} hitSlop={8}>
            <Text style={[styles.breadcrumbLink, { color: colors.primary }]}>ОТ, ГО и ЧС</Text>
          </TouchableOpacity>
          {breadcrumbs.map((seg) => (
            <View key={seg} style={styles.breadcrumbItem}>
              <Text style={[styles.breadcrumbSep, { color: colors.textMuted }]}> / </Text>
              <TouchableOpacity onPress={() => goToCrumb(seg)} hitSlop={8}>
                <Text style={[styles.breadcrumbLink, { color: colors.primary }]}>{seg}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>

      {loading && !refreshing ? (
        <View style={styles.centerBlock}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.muted, { color: colors.textMuted }]}>Загрузка…</Text>
        </View>
      ) : null}

      {error ? (
        <Text style={[styles.err, { color: colors.danger }]}>Ошибка: {error}</Text>
      ) : null}

      {!loading && !error ? (
        <View style={styles.list}>
          {folders.map((f) => (
            <FolderRow key={f.name} name={f.name} colors={colors} onPress={() => openFolder(f.name)} />
          ))}
          {files.map((f) => (
            <FileRow
              key={f.name}
              name={f.name}
              colors={colors}
              label={canPreview(f.name) ? 'Просмотр' : 'Открыть'}
              onOpen={() => openFileUrl(f.name)}
            />
          ))}
          {folders.length === 0 && files.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              Пока нет документов. Загрузка и папки — в админ-панели: «Редактирование разделов» → «Охрана труда, ГО и
              ЧС».
            </Text>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function FolderRow({
  name,
  colors,
  onPress,
}: {
  name: string;
  colors: ThemeColors;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, styles.rowFolder, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={styles.rowIcon}>📁</Text>
      <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={2}>
        {name}
      </Text>
    </TouchableOpacity>
  );
}

function FileRow({
  name,
  colors,
  label,
  onOpen,
}: {
  name: string;
  colors: ThemeColors;
  label: string;
  onOpen: () => void;
}) {
  return (
    <View style={[styles.row, styles.rowFile, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
      <Text style={styles.rowIcon}>📄</Text>
      <View style={styles.fileMain}>
        <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={3}>
          {name}
        </Text>
        <TouchableOpacity onPress={onOpen} style={styles.actionBtn}>
          <Text style={[styles.actionText, { color: colors.primary }]}>{label}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollInner: { paddingBottom: 32, paddingHorizontal: 16 },
  pageTitle: { fontSize: 18, fontWeight: '700', lineHeight: 24, marginBottom: 14 },
  breadcrumbScroll: { marginBottom: 14 },
  breadcrumbRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  breadcrumbItem: { flexDirection: 'row', alignItems: 'center' },
  breadcrumbSep: { fontSize: 14 },
  breadcrumbLink: { fontSize: 14, fontWeight: '600' },
  centerBlock: { paddingVertical: 24, alignItems: 'center' },
  muted: { marginTop: 10 },
  err: { marginBottom: 12, fontSize: 15 },
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    borderWidth: 2,
    padding: 14,
  },
  rowFolder: { gap: 10 },
  rowFile: { gap: 10 },
  rowIcon: { fontSize: 22, lineHeight: 26 },
  rowName: { flex: 1, fontSize: 15, fontWeight: '600' },
  fileMain: { flex: 1, minWidth: 0 },
  actionBtn: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 4 },
  actionText: { fontSize: 14, fontWeight: '600' },
  empty: { fontSize: 14, lineHeight: 20, marginTop: 8 },
});
