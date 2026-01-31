import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { Form } from '@/types';
import { FRAPPE_URL } from '@/lib/urls';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface FormViewerProps {
  form: Form;
  onBack: () => void;
}

const NativeWebView: any = Platform.OS === 'web' ? null : require('react-native-webview').WebView;

export function FormViewer({ form, onBack }: FormViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionCookie, setSessionCookie] = useState<string | null>(null);
  const [pageLoaded, setPageLoaded] = useState(false);
  
  // Memoize formUrl to prevent recalculation on every render
  const formUrl = useMemo(() => {
    const rawUrl = form.url || `/app/${form.name}`;
    const url = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
      ? rawUrl
      : rawUrl.startsWith('/')
        ? `${FRAPPE_URL}${rawUrl}`
        : `${FRAPPE_URL}/${rawUrl}`;
    
    return url;
  }, [form.url, form.name, FRAPPE_URL]);
  
  useEffect(() => {
    loadSessionCookie();
    // Reset states when form changes
    setLoading(true);
    setError(null);
    setPageLoaded(false);
  }, [form.name, form.url]);
  
  useEffect(() => {
    // Fallback timeout to clear loading state if it gets stuck
    const timeout = setTimeout(() => {
      setLoading((prevLoading) => {
        if (prevLoading && !pageLoaded) {
          console.warn('Loading timeout - clearing loading state');
          setPageLoaded(true);
          return false;
        }
        return prevLoading;
      });
    }, 8000); // 8 second timeout
    
    return () => clearTimeout(timeout);
  }, [formUrl, pageLoaded]);

  const loadSessionCookie = async () => {
    try {
      const sessionId = await AsyncStorage.getItem('frappe_session');
      if (sessionId) {
        setSessionCookie(`sid=${sessionId}`);
      }
    } catch (err) {
      console.error('Failed to load session cookie:', err);
    }
  };

  const handleLoadEnd = () => {
    // Clear loading when load ends
    setPageLoaded(true);
    setLoading(false);
    setError(null);
  };
  
  const handleNavigationStateChange = (navState: any) => {
    // Clear loading when navigation finishes
    if (navState.loading === false && navState.url) {
      setPageLoaded(true);
      setLoading(false);
      setError(null);
    }
  };

  const handleError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    const errorDesc = nativeEvent.description || '';
    const errorCode = nativeEvent.code;
    
    // Ignore Content-Length mismatch errors - nginx proxy handles this
    // If you see this error, verify you're connecting through nginx (port 8000, not direct Frappe)
    if (errorCode === -1 || errorDesc.includes('ERR_CONTENT_LENGTH_MISMATCH')) {
      console.warn('⚠️ Content-Length error detected - ensure connecting through nginx proxy');
      return;
    }
    
    // Ignore domain undefined errors on Android emulator
    if (errorDesc.includes('domain') && errorDesc.includes('undefined')) {
      return;
    }
    
    // For real errors, show after brief delay to allow page to recover
    setTimeout(() => {
      if (loading && !pageLoaded) {
        setError(errorDesc || 'Failed to load form');
        setLoading(false);
      }
    }, 3000);
  };

  const handleHttpError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.error('WebView HTTP error: ', nativeEvent);
    if (nativeEvent.statusCode >= 400) {
      setError(`Failed to load form (HTTP ${nativeEvent.statusCode})`);
      setLoading(false);
    }
  };

  const handleLoadStart = () => {
    // Only set loading if page hasn't loaded yet to prevent flickering
    if (!pageLoaded) {
      setLoading(true);
    }
    setError(null);
  };


  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          {/* Open in Browser button removed - not needed on mobile */}
        </View>
        <Text style={styles.title}>{form.label || form.name}</Text>
        {form.inherited && (
          <Text style={styles.inherited}>Inherited from {form.source}</Text>
        )}
      </View>
      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity 
            style={styles.retryButton} 
            onPress={() => { 
              setError(null); 
              setLoading(true); 
              setPageLoaded(false);
            }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {loading && !pageLoaded && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#0070f3" />
              <Text style={styles.loadingText}>Loading form...</Text>
            </View>
          )}
          {Platform.OS === 'web' ? (
            <iframe
              src={formUrl}
              style={{ border: 'none', width: '100%', height: '100%', flex: 1 }}
              title={form.label || form.name}
              onLoad={() => {
                setPageLoaded(true);
                setLoading(false);
                setError(null);
              }}
              onError={(e: any) => {
                setTimeout(() => {
                  if (loading && !pageLoaded) {
                    setError('Failed to load form');
                    setLoading(false);
                  }
                }, 2000);
              }}
            />
          ) : (
            <NativeWebView
              source={{ uri: formUrl }}
              style={styles.webview}
              onLoadStart={handleLoadStart}
              onLoadEnd={handleLoadEnd}
              onLoad={() => {
                setPageLoaded(true);
                setLoading(false);
                setError(null);
              }}
              onError={handleError}
              onHttpError={handleHttpError}
              onNavigationStateChange={handleNavigationStateChange}
              startInLoadingState={false}
              scalesPageToFit={true}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              sharedCookiesEnabled={true}
              thirdPartyCookiesEnabled={Platform.OS === 'android'}
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              cacheEnabled={false}
              incognito={false}
              cacheMode="LOAD_NO_CACHE"
              originWhitelist={['*']}
              mixedContentMode="always"
              androidHardwareAccelerationDisabled={false}
              androidLayerType="hardware"
              setSupportMultipleWindows={false}
              allowFileAccess={true}
              allowUniversalAccessFromFileURLs={true}
              allowFileAccessFromFileURLs={true}
              onMessage={(event: any) => {
                if (event.nativeEvent.data === 'pageLoaded') {
                  setPageLoaded(true);
                  setLoading(false);
                  setError(null);
                }
              }}
              injectedJavaScriptBeforeContentLoaded={sessionCookie ? `
                (function() {
                  try {
                    var cookies = document.cookie || '';
                    if (cookies.indexOf('sid=') === -1) {
                      document.cookie = '${sessionCookie}; path=/; domain=' + window.location.hostname;
                    }
                  } catch(e) {
                    console.error('Cookie injection failed:', e);
                  }
                })();
                true;
              ` : undefined}
              injectedJavaScript={`
                (function() {
                  function notifyLoaded() {
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage('pageLoaded');
                    }
                  }
                  
                  if (document.readyState === 'complete' || document.readyState === 'interactive') {
                    setTimeout(notifyLoaded, 100);
                  } else {
                    window.addEventListener('load', notifyLoaded, { once: true });
                  }
                })();
                true;
              `}
            />
          )}
        </>
      )}
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
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  backButton: {
    flex: 1,
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
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
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
