import { Tabs } from 'expo-router';
import { colors, fonts, fontSize } from '../../src/theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.brand900, borderTopColor: colors.brand800 },
        tabBarActiveTintColor: colors.textInverse,
        tabBarInactiveTintColor: colors.brand100,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: fontSize.xs },
        tabBarIconStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="tickets" options={{ title: 'My tickets' }} />
    </Tabs>
  );
}
