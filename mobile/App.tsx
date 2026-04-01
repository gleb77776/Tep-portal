import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  NavigationContainer,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import type { ThemeColors, ThemeMode } from './src/theme/colors';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import HeaderSettingsButton from './src/components/HeaderSettingsButton';
import type { RootStackParamList } from './src/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const USERNAME_KEY = 'ad_username';

function buildNavTheme(colors: ThemeColors, mode: ThemeMode): NavigationTheme {
  const base = mode === 'dark' ? NavigationDarkTheme : NavigationDefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.screenBg,
      card: colors.cardBg,
      text: colors.text,
      border: colors.cardBorder,
      notification: colors.primaryLight,
    },
  };
}

function RootNavigator() {
  const { colors, mode, ready: themeReady } = useTheme();
  const [routeReady, setRouteReady] = useState(false);
  const [initial, setInitial] = useState<keyof RootStackParamList>('Login');

  useEffect(() => {
    AsyncStorage.getItem(USERNAME_KEY).then((u) => {
      setInitial(u?.trim() ? 'Home' : 'Login');
      setRouteReady(true);
    });
  }, []);

  const navTheme = useMemo(() => buildNavTheme(colors, mode), [colors, mode]);

  if (!themeReady || !routeReady) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.screenBg,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName={initial}
        screenOptions={{
          headerStyle: { backgroundColor: colors.cardBg },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text, fontWeight: '600' },
          headerShadowVisible: mode === 'light',
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={({ navigation }) => ({
            title: 'Портал',
            headerRight: () => <HeaderSettingsButton navigation={navigation} />,
          })}
        />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Настройки' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootNavigator />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
