import { useState, useEffect } from 'react';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Report } from '@/types';
import { generateEmbedUrl } from '@/lib/api';
import { IS_WEB } from '@/lib/urls';

interface ReportViewerProps {
  report: Report;
  user: string;
  onBack: () => void;
}

const NativeWebView: any = Platform.OS === 'web' ? null : require('react-native-webview').WebView;

export function ReportViewer({ report, user, onBack }: ReportViewerProps) {
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    try {
      setLoading(true);
      let url = await generateEmbedUrl({
        reportId: report.id,
        reportUid: report.uid,
        filters: report.context || {},
        frappeUser: user
      });
      
      // On Android emulator (not web), replace localhost with 10.0.2.2 to reach host machine
      // On web, keep localhost as browsers can't reach 10.0.2.2
      if (!IS_WEB && Platform.OS === 'android' && url.includes('localhost')) {
        url = url.replace(/localhost/g, '10.0.2.2');
      }
      
      setEmbedUrl(url);
    } catch (err: any) {
      setError(err.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{report.name}</Text>
        {report.inherited && (
          <Text style={styles.inherited}>Inherited from {report.source}</Text>
        )}
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0070f3" />
          <Text style={styles.loadingText}>Loading report...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadReport}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : embedUrl ? (
        Platform.OS === 'web' ? (
          <iframe
            src={embedUrl}
            style={{ border: 'none', width: '100%', height: '100%', flex: 1 }}
            title={report.name}
          />
        ) : (
          <NativeWebView
            source={{ uri: embedUrl }}
            style={styles.webview}
            startInLoadingState
            scalesPageToFit
          />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    marginBottom: 8,
  },
  backText: {
    fontSize: 16,
    color: '#0070f3',
    fontWeight: '500',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  inherited: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  webview: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  error: {
    color: '#c33',
    backgroundColor: '#fee',
    padding: 16,
    borderRadius: 4,
    marginBottom: 16,
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#0070f3',
    padding: 12,
    borderRadius: 4,
    paddingHorizontal: 24,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});
