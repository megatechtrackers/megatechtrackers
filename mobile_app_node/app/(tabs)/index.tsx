import { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Modal, Alert } from 'react-native';
import { useAuth } from '@/lib/auth';
import { getUserPermissions } from '@/lib/api';
import { Form } from '@/types';
import { FormViewer } from '@/components/FormViewer';
import { DrawerContent } from '@/components/DrawerContent';
import { Ionicons } from '@expo/vector-icons';
import { useNetworkStatus } from '@/utils/offline';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

export default function FormsScreen() {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const { user } = useAuth();
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedForm, setSelectedForm] = useState<Form | null>(null);
  const networkStatus = useNetworkStatus();
  const params = useLocalSearchParams<{ formName?: string }>();
  const router = useRouter();

  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);

  useEffect(() => {
    loadForms().then(() => {
      setHasInitiallyLoaded(true);
    });
  }, [user]);

  // Refresh data when screen comes into focus (e.g., when returning from drawer)
  useFocusEffect(
    useCallback(() => {
      if (user && hasInitiallyLoaded) {
        // Refresh in background without showing loading state
        loadForms(false);
      }
    }, [user, hasInitiallyLoaded])
  );

  // Handle form selection from route params (when navigating from drawer)
  useEffect(() => {
    if (params.formName && forms.length > 0 && !selectedForm) {
      try {
        const decodedName = decodeURIComponent(params.formName);
        const form = forms.find(f => f.name === decodedName);
        if (form) {
          setSelectedForm(form);
        }
      } catch (e) {
        console.error('Error decoding form name:', e);
      }
    }
  }, [params.formName, forms, selectedForm]);

  const loadForms = async (showLoading = true) => {
    if (!user) return;
    if (showLoading) {
      setLoading(true);
    }
    try {
      const permissions = await getUserPermissions(user);
      setForms(permissions.forms || []);
    } catch (error: any) {
      console.error('Failed to load forms:', error);
      if (!networkStatus.isConnected) {
        Alert.alert(
          'Offline',
          'You are currently offline. Showing cached data if available.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadForms();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0070f3" />
      </View>
    );
  }

  if (selectedForm) {
    return <FormViewer form={selectedForm} onBack={() => {
      setSelectedForm(null);
      // Clear the route param when going back
      if (params.formName) {
        try {
          router.setParams({ formName: undefined });
        } catch (e) {
          // Ignore errors when clearing params
        }
      }
    }} />;
  }

  return (
    <>
      <Modal
        visible={drawerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDrawerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.drawerContainer}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>Menu</Text>
              <TouchableOpacity onPress={() => setDrawerVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <DrawerContent 
              onClose={() => setDrawerVisible(false)}
              activeForm={undefined}
            />
          </View>
        </View>
      </Modal>
      <View style={styles.container}>
        {!networkStatus.isConnected && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline" size={16} color="#fff" />
            <Text style={styles.offlineText}>Offline - Showing cached data</Text>
          </View>
        )}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => setDrawerVisible(true)}
              style={styles.menuButton}
              accessibilityLabel="Open menu"
            >
              <Ionicons name="menu" size={22} color="#333" />
            </TouchableOpacity>
            <View>
              <Text style={styles.title}>Forms</Text>
              <Text style={styles.count}>{forms.length} available</Text>
            </View>
          </View>
        </View>
        <FlatList
          data={forms}
          keyExtractor={(item) => item.name}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.item}
              onPress={() => setSelectedForm(item)}
            >
              <Text style={styles.itemTitle}>{item.label || item.name}</Text>
              {item.inherited && (
                <Text style={styles.inherited}>Inherited from {item.source}</Text>
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-outline" size={64} color="#ccc" style={{ marginBottom: 16 }} />
              <Text style={styles.emptyTitle}>No Forms Assigned</Text>
              <Text style={styles.emptyText}>
                You don't have access to any forms.{'\n'}
                Please contact your administrator to get access.
              </Text>
            </View>
          }
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuButton: {
    padding: 6,
    borderRadius: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
  },
  count: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  item: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  inherited: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  empty: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
  },
  drawerContainer: {
    width: '80%',
    maxWidth: 300,
    height: '100%',
    backgroundColor: '#fff',
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingTop: 60,
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  offlineBanner: {
    backgroundColor: '#ff9800',
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  offlineText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
