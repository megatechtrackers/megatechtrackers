import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Switch, Alert, KeyboardAvoidingView, Platform, ScrollView, Modal } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { FRAPPE_URL, IS_WEB } from '@/lib/urls';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    setError('');
    setLoading(true);

    try {
      await login(username, password, rememberMe);
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotPasswordEmail && !username) {
      Alert.alert('Error', 'Please enter your username or email');
      return;
    }

    setForgotPasswordLoading(true);
    try {
      await axios.post(
        `${FRAPPE_URL}/api/method/frappe.core.doctype.user.user.reset_password`,
        { user: forgotPasswordEmail || username },
        IS_WEB ? { withCredentials: true } : undefined
      );

      Alert.alert(
        'Success',
        'Password reset link has been sent to your email address if the account exists.',
        [
          {
            text: 'OK',
            onPress: () => {
              setShowForgotPassword(false);
              setForgotPasswordEmail('');
            }
          }
        ]
      );
    } catch (err: any) {
      Alert.alert(
        'Error',
        err.response?.data?.message || 'Failed to send password reset. Please try again or contact your administrator.',
        [{ text: 'OK' }]
      );
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
        <Text style={styles.title}>Megatechtrackers</Text>
        <Text style={styles.subtitle}>Sign In</Text>

        <TextInput
          style={styles.input}
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
        />

        <View style={styles.optionsRow}>
          <View style={styles.rememberMeContainer}>
            <Switch
              value={rememberMe}
              onValueChange={setRememberMe}
              disabled={loading}
              trackColor={{ false: '#ddd', true: '#0070f3' }}
            />
            <Text style={styles.rememberMeText}>Remember me</Text>
          </View>
          <TouchableOpacity onPress={() => setShowForgotPassword(true)} disabled={loading}>
            <Text style={styles.forgotPasswordText}>Forgot password?</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Forgot Password Modal */}
      <Modal
        visible={showForgotPassword}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowForgotPassword(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.modalSubtitle}>Enter your username or email to receive a password reset link</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Username or Email"
              value={forgotPasswordEmail || username}
              onChangeText={(text) => setForgotPasswordEmail(text)}
              autoCapitalize="none"
              editable={!forgotPasswordLoading}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowForgotPassword(false);
                  setForgotPasswordEmail('');
                }}
                disabled={forgotPasswordLoading}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSubmit, forgotPasswordLoading && styles.buttonDisabled]}
                onPress={handleForgotPassword}
                disabled={forgotPasswordLoading}
              >
                {forgotPasswordLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalButtonTextSubmit}>Send Reset Link</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#667eea',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 25,
    elevation: 5,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#0070f3',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '400',
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#0070f3',
    padding: 14,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  error: {
    color: '#c33',
    backgroundColor: '#fee',
    padding: 12,
    borderRadius: 4,
    marginBottom: 16,
    fontSize: 14,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rememberMeText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#333',
  },
  forgotPasswordText: {
    fontSize: 14,
    color: '#0070f3',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 25,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 4,
    minWidth: 100,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  modalButtonSubmit: {
    backgroundColor: '#0070f3',
  },
  modalButtonTextCancel: {
    color: '#333',
    fontSize: 14,
    fontWeight: '500',
  },
  modalButtonTextSubmit: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
