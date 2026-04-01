import { Pressable, Text } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

export default function HeaderSettingsButton({
  navigation,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
}) {
  return (
    <Pressable
      onPress={() => navigation.navigate('Settings')}
      style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}
      accessibilityLabel="Настройки"
    >
      <Text style={{ fontSize: 22 }}>⚙️</Text>
    </Pressable>
  );
}
