import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import LogoHeader from '../components/LogoHeader';
import { loginAd } from '../api/client';
import { setIdentityAck } from '../utils/identityAckStorage';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../context/ThemeContext';

const USERNAME_KEY = 'ad_username';
const SNAPSHOT_KEY = 'portal_user_snapshot';

type Props = NativeStackScreenProps<RootStackParamList, 'IdentityWelcome'>;

export default function IdentityWelcomeScreen({ navigation }: Props) {
  const { colors, mode } = useTheme();
  const { width } = useWindowDimensions();
  const cardMax = Math.min(400, width - 40);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const bgGradient =
    mode === 'dark'
      ? (['#1a1d24', '#12151c'] as const)
      : (['#f5f9ff', '#e6f0fa'] as const);

  async function onSubmit() {
    const u = username.trim();
    if (!u || !password) {
      Alert.alert('Вход', 'Введите логин и пароль учётной записи домена');
      return;
    }
    setLoading(true);
    try {
      await loginAd(u, password);
      await AsyncStorage.setItem(USERNAME_KEY, u);
      await setIdentityAck(u);
      await AsyncStorage.removeItem(SNAPSHOT_KEY);
      navigation.replace('Home');
    } catch (e) {
      Alert.alert('Вход', e instanceof Error ? e.message : 'Не удалось войти');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={bgGradient} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <LogoHeader subtitle="Корпоративный портал" />
            <View style={styles.centerBlock}>
              <View
                style={[
                  styles.card,
                  {
                    width: cardMax,
                    backgroundColor: colors.cardBg,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <Text style={[styles.cardTitle, { color: colors.text }]}>Вход</Text>
                <Text style={[styles.label, { color: colors.textMuted }]}>Логин</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.inputBg,
                      borderColor: colors.inputBorder,
                      color: colors.textSecondary,
                    },
                  ]}
                  placeholder="sAMAccountName"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={username}
                  onChangeText={setUsername}
                  editable={!loading}
                />
                <Text style={[styles.label, styles.labelSpaced, { color: colors.textMuted }]}>
                  Пароль
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.inputBg,
                      borderColor: colors.inputBorder,
                      color: colors.textSecondary,
                    },
                  ]}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  editable={!loading}
                />
                <TouchableOpacity
                  style={[
                    styles.btn,
                    { backgroundColor: colors.buttonPrimary },
                    loading && styles.btnDisabled,
                  ]}
                  onPress={() => void onSubmit()}
                  disabled={loading}
                  activeOpacity={0.88}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.buttonPrimaryText} />
                  ) : (
                    <Text style={[styles.btnText, { color: colors.buttonPrimaryText }]}>Войти</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingBottom: 28,
  },
  centerBlock: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    minHeight: 360,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#1e5cb0',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 18,
    textAlign: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  labelSpaced: { marginTop: 4 },
  input: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    minHeight: 50,
  },
  btnDisabled: { opacity: 0.85 },
  btnText: { fontSize: 17, fontWeight: '700', letterSpacing: 0.4 },
});
