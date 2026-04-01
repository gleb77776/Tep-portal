import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import type { RootStackParamList } from './src/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const USERNAME_KEY = 'ad_username';

export default function App() {
  const [ready, setReady] = useState(false);
  const [initial, setInitial] = useState<keyof RootStackParamList>('Login');

  useEffect(() => {
    AsyncStorage.getItem(USERNAME_KEY).then((u) => {
      setInitial(u?.trim() ? 'Home' : 'Login');
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initial}>
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Вход' }} />
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Портал' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
