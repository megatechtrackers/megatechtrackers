import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { FRAPPE_URL, IS_WEB } from '@/lib/urls';

interface AuthContextType {
  user: string | null;
  loading: boolean;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const rememberMe = await AsyncStorage.getItem('remember_me');
      const storedUser = await AsyncStorage.getItem('frappe_user');
      const sessionId = await AsyncStorage.getItem('frappe_session');

      // Web: we can't read sid from Set-Cookie, so we validate using browser cookies.
      // Only auto-restore when user explicitly enabled "remember me".
      if (IS_WEB) {
        if (rememberMe !== 'true' || !storedUser) return;
        const response = await axios.get(`${FRAPPE_URL}/api/method/frappe.auth.get_logged_user`, {
          withCredentials: true,
        });

        if (response.data.message === storedUser) {
          setUser(storedUser);
        } else {
          await AsyncStorage.multiRemove(['frappe_user', 'frappe_session', 'remember_me']);
        }
        return;
      }

      // Native: validate using stored sid.
      if (storedUser && sessionId) {
        const response = await axios.get(`${FRAPPE_URL}/api/method/frappe.auth.get_logged_user`, {
          headers: { 'Cookie': `sid=${sessionId}` },
        });

        if (response.data.message === storedUser) {
          setUser(storedUser);
        } else {
          await AsyncStorage.multiRemove(['frappe_user', 'frappe_session']);
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      await AsyncStorage.multiRemove(['frappe_user', 'frappe_session', 'remember_me']);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username: string, password: string, rememberMe: boolean = false) => {
    try {
      const response = await axios.post(
        `${FRAPPE_URL}/api/method/login`,
        { usr: username, pwd: password },
        IS_WEB ? { withCredentials: true } : undefined
      );

      if (response.data.message === 'Logged In') {
        // Persist across reload only when rememberMe is enabled (web). Native keeps previous behavior.
        if (IS_WEB) {
          if (rememberMe) {
            await AsyncStorage.setItem('frappe_user', username);
          } else {
            await AsyncStorage.removeItem('frappe_user');
          }
        } else {
          await AsyncStorage.setItem('frappe_user', username);
        }

        if (!IS_WEB) {
          // Native: extract session from set-cookie and store it (Web cannot read set-cookie).
          const cookies = (response.headers as any)?.['set-cookie'] as string[] | string | undefined;
          if (cookies) {
            const sidCookie = Array.isArray(cookies)
              ? cookies.find((c: string) => c.startsWith('sid='))
              : typeof cookies === 'string' && cookies.startsWith('sid=') ? cookies : null;

            if (sidCookie) {
              const sessionId = sidCookie.split(';')[0].split('=')[1];
              await AsyncStorage.setItem('frappe_session', sessionId);
            }
          }
        }

        if (rememberMe) {
          await AsyncStorage.setItem('remember_me', 'true');
        } else {
          await AsyncStorage.removeItem('remember_me');
        }

        setUser(username);

        // Note: removed invalid frappe.utils.logger.log call (not an exposed API method).
      } else {
        throw new Error('Login failed');
      }
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Login failed');
    }
  };

  const logout = async () => {
    const currentUser = user;
    await AsyncStorage.multiRemove(['frappe_user', 'frappe_session', 'remember_me']);
    setUser(null);
    
    // Logout and audit log (non-blocking)
    axios.post(`${FRAPPE_URL}/api/method/logout`, {}, IS_WEB ? { withCredentials: true } : undefined).catch(console.error);
    
    if (currentUser) {
      // Note: removed invalid frappe.utils.logger.log call (not an exposed API method).
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
