import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { getUserPermissions } from '@/lib/api';
import { Ionicons } from '@expo/vector-icons';
import { Form, Report } from '@/types';

interface DrawerContentProps {
  onClose?: () => void;
  activeForm?: string;
  activeReport?: number;
}

export function DrawerContent({ onClose, activeForm, activeReport }: DrawerContentProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [formsExpanded, setFormsExpanded] = useState(true);
  const [reportsExpanded, setReportsExpanded] = useState(true);
  const [forms, setForms] = useState<Form[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    try {
      const permissions = await getUserPermissions(user);
      setForms(permissions.forms || []);
      setReports(permissions.reports || []);
    } catch (error) {
      console.error('Failed to load permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.replace('/(auth)/login');
  };

  const handleFormSelect = (form: Form) => {
    // Navigate to forms tab (index route) with form name as parameter
    // Use the same pattern as reports - navigate to /(tabs) which defaults to index
    router.push({
      pathname: '/(tabs)',
      params: { formName: form.name }
    });
    onClose?.();
  };

  const handleReportSelect = (report: Report) => {
    // Navigate to reports tab with report ID as parameter
    router.push({
      pathname: '/(tabs)/reports',
      params: { reportId: report.id.toString() }
    });
    onClose?.();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Megatechtrackers</Text>
        {user && <Text style={styles.user}>{user}</Text>}
      </View>
      
      <ScrollView 
        style={styles.menu}
        contentContainerStyle={styles.menuContent}
        showsVerticalScrollIndicator={true}
      >
        {forms.length === 0 && reports.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Ionicons name="document-outline" size={64} color="#ccc" />
            <Text style={styles.emptyStateTitle}>No Access</Text>
            <Text style={styles.emptyStateText}>
              You don't have any forms or reports assigned.{'\n'}
              Please contact your administrator to get access.
            </Text>
          </View>
        ) : (
          <>
            {/* Forms Section (only if there are forms) */}
            {forms.length > 0 && (
              <>
                <TouchableOpacity
                  style={styles.sectionHeader}
                  onPress={() => setFormsExpanded(!formsExpanded)}
                >
                  <View style={styles.sectionHeaderContent}>
                    <Ionicons name="document-text" size={20} color="#333" />
                    <Text style={styles.sectionTitle}>Forms ({forms.length})</Text>
                  </View>
                  <Ionicons 
                    name={formsExpanded ? "chevron-up" : "chevron-down"} 
                    size={20} 
                    color="#666" 
                  />
                </TouchableOpacity>
                {formsExpanded && (
                  <View>
                    {forms.map((form) => (
                      <TouchableOpacity
                        key={form.name}
                        style={[
                          styles.menuItem,
                          activeForm === form.name && styles.activeMenuItem
                        ]}
                        onPress={() => handleFormSelect(form)}
                      >
                        <Text style={[
                          styles.menuText,
                          activeForm === form.name && styles.activeMenuText
                        ]}>
                          {form.label || form.name}
                        </Text>
                        {form.inherited && (
                          <Text style={styles.inheritedBadge}>Inherited</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}

            {/* Reports Section (only if there are reports) */}
            {reports.length > 0 && (
              <>
                <TouchableOpacity
                  style={styles.sectionHeader}
                  onPress={() => setReportsExpanded(!reportsExpanded)}
                >
                  <View style={styles.sectionHeaderContent}>
                    <Ionicons name="bar-chart" size={20} color="#333" />
                    <Text style={styles.sectionTitle}>Reports ({reports.length})</Text>
                  </View>
                  <Ionicons 
                    name={reportsExpanded ? "chevron-up" : "chevron-down"} 
                    size={20} 
                    color="#666" 
                  />
                </TouchableOpacity>
                {reportsExpanded && (
                  <View>
                    {reports.map((report) => (
                      <TouchableOpacity
                        key={report.id}
                        style={[
                          styles.menuItem,
                          activeReport === report.id && styles.activeMenuItem
                        ]}
                        onPress={() => handleReportSelect(report)}
                      >
                        <Text style={[
                          styles.menuText,
                          activeReport === report.id && styles.activeMenuText
                        ]}>
                          {report.name}
                        </Text>
                        {report.inherited && (
                          <Text style={styles.inheritedBadge}>Inherited</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Ionicons name="log-out" size={24} color="#ff4444" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0070f3',
    marginBottom: 8,
  },
  user: {
    fontSize: 14,
    color: '#666',
  },
  menu: {
    flex: 1,
  },
  menuContent: {
    paddingTop: 20,
    paddingBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingLeft: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    paddingLeft: 48,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  inheritedBadge: {
    fontSize: 11,
    color: '#666',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    padding: 16,
    paddingLeft: 48,
    fontStyle: 'italic',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  activeMenuItem: {
    backgroundColor: '#e3f2fd',
  },
  activeMenuText: {
    color: '#0070f3',
    fontWeight: '600',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    padding: 16,
    backgroundColor: '#fff',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoutText: {
    fontSize: 16,
    color: '#ff4444',
    marginLeft: 16,
    fontWeight: '500',
  },
});
