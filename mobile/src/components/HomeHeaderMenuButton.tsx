import { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

export default function HomeHeaderMenuButton({ navigation }: { navigation: Nav }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW } = Dimensions.get('window');
  const panelW = Math.min(320, Math.round(winW * 0.78));
  const slide = useRef(new Animated.Value(panelW)).current;
  const [visible, setVisible] = useState(false);

  const open = useCallback(() => {
    slide.setValue(panelW);
    setVisible(true);
  }, [panelW, slide]);

  const finishClose = useCallback(
    (after?: () => void) => {
      Animated.timing(slide, {
        toValue: panelW,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setVisible(false);
          after?.();
        }
      });
    },
    [panelW, slide]
  );

  const goSections = () => finishClose(() => navigation.navigate('Sections'));
  const goSettings = () => finishClose(() => navigation.navigate('Settings'));

  const onShowModal = useCallback(() => {
    Animated.timing(slide, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [slide]);

  return (
    <>
      <Pressable
        onPress={open}
        style={({ pressed }) => ({
          paddingHorizontal: 14,
          paddingVertical: 10,
          opacity: pressed ? 0.65 : 1,
        })}
        accessibilityLabel="Открыть меню"
        accessibilityRole="button"
      >
        <View style={styles.hamburger}>
          <View style={[styles.bar, { backgroundColor: colors.text }]} />
          <View style={[styles.bar, { backgroundColor: colors.text }]} />
          <View style={[styles.bar, { backgroundColor: colors.text }]} />
        </View>
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={() => finishClose()}
        onShow={onShowModal}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => finishClose()} accessibilityLabel="Закрыть меню" />
          <Animated.View
            style={[
              styles.panel,
              {
                width: panelW,
                backgroundColor: colors.cardBg,
                borderLeftColor: colors.cardBorder,
                paddingTop: Math.max(insets.top, 12),
                paddingBottom: Math.max(insets.bottom, 16),
                transform: [{ translateX: slide }],
              },
            ]}
          >
            <Text style={[styles.panelTitle, { color: colors.textMuted }]}>Меню</Text>
            <Pressable
              style={({ pressed }) => [
                styles.menuRow,
                { borderBottomColor: colors.inputBorder },
                pressed && { opacity: 0.75 },
              ]}
              onPress={goSections}
            >
              <Text style={styles.menuIcon}>📚</Text>
              <Text style={[styles.menuLabel, { color: colors.text }]}>Все разделы</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.menuRow,
                { borderBottomColor: colors.inputBorder },
                pressed && { opacity: 0.75 },
              ]}
              onPress={goSettings}
            >
              <Text style={styles.menuIcon}>⚙️</Text>
              <Text style={[styles.menuLabel, { color: colors.text }]}>Настройки</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  hamburger: {
    justifyContent: 'space-between',
    height: 16,
    width: 24,
  },
  bar: {
    height: 3,
    borderRadius: 1,
    width: '100%',
  },
  modalRoot: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  panel: {
    borderLeftWidth: 1,
    paddingHorizontal: 0,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 16,
  },
  panelTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuIcon: { fontSize: 22 },
  menuLabel: { fontSize: 17, fontWeight: '600' },
});
