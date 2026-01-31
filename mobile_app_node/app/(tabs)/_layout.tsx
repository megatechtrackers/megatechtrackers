import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Navbar } from '@/components/Navbar';
import { useAuth } from '@/lib/auth';
import { useState, useEffect } from 'react';
import { getUserPermissions } from '@/lib/api';

export default function TabsLayout() {
  const { user } = useAuth();
  const [hasForms, setHasForms] = useState(true);
  const [hasReports, setHasReports] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadPermissions();
    }
  }, [user]);

  const loadPermissions = async () => {
    if (!user) return;
    try {
      const permissions = await getUserPermissions(user);
      setHasForms((permissions.forms || []).length > 0);
      setHasReports((permissions.reports || []).length > 0);
    } catch (error) {
      console.error('Failed to load permissions:', error);
      // Default to showing both if we can't load permissions
      setHasForms(true);
      setHasReports(true);
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while checking permissions
  if (loading) {
    return null; // Or return a loading component
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        header: () => <Navbar />,
        tabBarActiveTintColor: '#0070f3',
        tabBarInactiveTintColor: '#666',
      }}
    >
      {hasForms && (
        <Tabs.Screen
          name="index"
          options={{
            title: 'Forms',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="document-text" size={size} color={color} />
            ),
          }}
        />
      )}
      {hasReports && (
        <Tabs.Screen
          name="reports"
          options={{
            title: 'Reports',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="bar-chart" size={size} color={color} />
            ),
          }}
        />
      )}
    </Tabs>
  );
}
