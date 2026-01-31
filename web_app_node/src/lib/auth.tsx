'use client';

import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import Cookies from 'js-cookie';
import axios from 'axios';

const FRAPPE_URL = process.env.NEXT_PUBLIC_FRAPPE_URL || 'http://localhost:8000';

interface AuthContextType {
  user: string | null;
  loading: boolean;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const clearAuthCookies = useCallback(() => {
    Cookies.remove('sid', { path: '/' });
    Cookies.remove('frappe_sid', { path: '/' });
    Cookies.remove('frappe_user', { path: '/' });
    document.cookie = 'sid=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'frappe_sid=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'frappe_user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  }, []);

  const validateSession = useCallback(async (sessionId: string, frappeUser: string) => {
    try {
      // Use the API route that properly forwards cookies
      // Try to get sessionId from cookies if not provided
      const actualSessionId = sessionId || Cookies.get('sid') || Cookies.get('frappe_sid') || 
        document.cookie.split(';').find(c => c.trim().startsWith('sid=') || c.trim().startsWith('frappe_sid='))?.split('=')[1]?.trim();
      
      if (!actualSessionId) {
        console.warn('No session ID available for validation');
        setLoading(false);
        return false;
      }
      
      // Don't throw on 401/403 — we want to handle "session expired" gracefully.
      const response = await axios.get(`/api/frappe/method/frappe.auth.get_logged_user`, {
        withCredentials: true,
        validateStatus: () => true,
        // Fallback: if cookies aren't being sent for some reason, allow the API route
        // to use this header to reconstruct the `sid` cookie when proxying to Frappe.
        headers: {
          'X-Frappe-Session-Id': actualSessionId,
        },
      });

      if (response.status === 401 || response.status === 403) {
        console.warn('Session invalid/expired (Frappe rejected session)', {
          status: response.status,
          data: response.data ?? null,
        });
        clearAuthCookies();
        setUser(null);
        setLoading(false);
        return false;
      }

      if (response.status < 200 || response.status >= 300) {
        console.error('Session validation request failed', {
          status: response.status,
          data: response.data ?? null,
        });
        setLoading(false);
        return false;
      }

      // Check if we got a valid response
      if (response.data && response.data.message) {
        const loggedInUser = response.data.message;
        
        if (loggedInUser === frappeUser) {
          setUser(frappeUser);
          setLoading(false);
          console.log('Session validated successfully:', frappeUser);
          return true;
        } else {
          console.warn('Session validation failed: user mismatch', {
            expected: frappeUser,
            received: loggedInUser
          });
          clearAuthCookies();
          setUser(null);
          setLoading(false);
          return false;
        }
      } else {
        // No user returned - session invalid
        console.warn('Session validation failed: no user in response');
        clearAuthCookies();
        setUser(null);
        setLoading(false);
        return false;
      }
    } catch (error: any) {
      // Make sure we log something useful even if the thrown value isn't an Error/AxiosError.
      const isAxios = axios.isAxiosError(error);
      console.error('Session validation failed (unexpected error):', {
        isAxiosError: isAxios,
        status: error?.response?.status ?? null,
        message: error?.message ?? (typeof error === 'string' ? error : null),
        code: error?.code ?? null,
        data: error?.response?.data ?? null,
        url: error?.config?.url ?? null,
        method: error?.config?.method ?? null,
      });
      
      // Only clear cookies on authentication errors, not network errors
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.log('Authentication error - clearing cookies');
        clearAuthCookies();
        setUser(null);
      } else if (!error.response) {
        // Network error - don't clear cookies, might be temporary
        console.warn('Network error during session validation - keeping cookies');
      }
      setLoading(false);
      return false;
    }
  }, [clearAuthCookies]);

  useEffect(() => {
    // Check for existing session on mount
    const checkSession = async () => {
      // Try both js-cookie and document.cookie
      // Also check for 'frappe_sid' as backup if 'sid' is blocked
      const sessionId = Cookies.get('sid') || Cookies.get('frappe_sid') || 
        document.cookie.split(';').find(c => c.trim().startsWith('sid=') || c.trim().startsWith('frappe_sid='))?.split('=')[1]?.trim();
      const frappeUser = Cookies.get('frappe_user') || document.cookie.split(';').find(c => c.trim().startsWith('frappe_user='))?.split('=')[1]?.trim();
      
      console.log('Checking session on mount:', {
        hasSessionId: !!sessionId,
        hasFrappeUser: !!frappeUser,
        sessionId: sessionId ? sessionId.substring(0, 10) + '...' : null,
        frappeUser,
        allCookies: document.cookie.split(';').map(c => c.trim().split('=')[0]).join(', ')
      });
      
      if (sessionId && frappeUser) {
        await validateSession(sessionId, frappeUser);
      } else {
        console.log('No session cookies found', {
          sessionIdSource: Cookies.get('sid') ? 'js-cookie' : (document.cookie.includes('sid=') ? 'document.cookie' : 'not found'),
          userSource: Cookies.get('frappe_user') ? 'js-cookie' : (document.cookie.includes('frappe_user=') ? 'document.cookie' : 'not found')
        });
        setLoading(false);
      }
    };

    checkSession();

    // Set up automatic session refresh every 5 minutes
    const refreshInterval = setInterval(() => {
      const currentSessionId = Cookies.get('sid') || Cookies.get('frappe_sid') || 
        document.cookie.split(';').find(c => {
          const trimmed = c.trim();
          return trimmed.startsWith('sid=') || trimmed.startsWith('frappe_sid=');
        })?.split('=')[1]?.trim();
      const currentFrappeUser = Cookies.get('frappe_user') || document.cookie.split(';').find(c => c.trim().startsWith('frappe_user='))?.split('=')[1]?.trim();
      if (currentSessionId && currentFrappeUser) {
        console.log('Refreshing session...');
        validateSession(currentSessionId, currentFrappeUser);
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(refreshInterval);
  }, [validateSession]);

  const login = async (username: string, password: string, rememberMe: boolean = false) => {
    try {
      // Use Next.js API route for login to properly handle cookies
      const response = await axios.post(
        `/api/frappe/login`,
        {
          usr: username,
          pwd: password,
        },
        {
          withCredentials: true,
        }
      );

      if (response.data.message === 'Logged In') {
        console.log('Login successful, response:', response.data);
        
        const cookieOptions = rememberMe 
          ? { expires: 30, sameSite: 'lax' as const, path: '/' } // 30 days if remember me
          : { expires: 7, sameSite: 'lax' as const, path: '/' }; // 7 days default
        
        // Get session ID from response (API route includes it in the response body)
        let sid: string | null = response.data.sessionId || null;
        
        // Fallback: try to extract from Set-Cookie header
        if (!sid) {
          const setCookieHeader = response.headers['set-cookie'];
          if (setCookieHeader) {
            let sidCookie: string | null = null;
            
            if (Array.isArray(setCookieHeader)) {
              sidCookie = setCookieHeader.find((c: string) => c.startsWith('sid=')) || null;
            } else {
              const cookieStr = setCookieHeader as string;
              sidCookie = cookieStr.startsWith('sid=') ? cookieStr : null;
            }
            
            if (sidCookie) {
              sid = sidCookie.split(';')[0].split('=')[1];
            }
          }
        }
        
        // Fallback: try to get from document.cookie if available
        if (!sid) {
          const allCookies = document.cookie.split(';');
          const sidCookie = allCookies.find(c => c.trim().startsWith('sid='));
          if (sidCookie) {
            sid = sidCookie.split('=')[1].trim();
          }
        }
        
        // Set user state immediately
        setUser(username);
        setLoading(false);
        console.log('User state updated:', username);
        
        // Wait for server-set cookies to be available, then verify
        // Server should set cookies via Set-Cookie headers
        setTimeout(() => {
          // Check if cookies were set by the server (from Set-Cookie headers)
          // Check both 'sid' and 'frappe_sid' (since 'sid' might be blocked by browser)
          const serverSid = Cookies.get('sid') || Cookies.get('frappe_sid') || 
            document.cookie.split(';').find(c => {
              const trimmed = c.trim();
              return trimmed.startsWith('sid=') || trimmed.startsWith('frappe_sid=');
            })?.split('=')[1]?.trim();
          const serverUser = Cookies.get('frappe_user') || document.cookie.split(';').find(c => c.trim().startsWith('frappe_user='))?.split('=')[1]?.trim();
          
          console.log('Cookie verification:', {
            serverSid: serverSid ? serverSid.substring(0, 10) + '...' : 'NOT FOUND',
            serverUser: serverUser || 'NOT FOUND',
            cookieNames: document.cookie.split(';').map(c => c.trim().split('=')[0]).join(', ')
          });
          
          if (serverSid && serverUser) {
            console.log('✅ Server-set cookies verified and working!');
          } else {
            console.warn('⚠️ Server cookies not found, setting client-side fallback...');
            
            // Fallback: set cookies client-side if server didn't set them
            // Since 'sid' might be blocked, prioritize 'frappe_sid' (which we know works)
            if (sid && !serverSid) {
              try {
                // Set frappe_sid (this works based on test - "sid" name is blocked)
                Cookies.set('frappe_sid', sid, cookieOptions);
                const expires = rememberMe 
                  ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString()
                  : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
                document.cookie = `frappe_sid=${encodeURIComponent(sid)}; path=/; expires=${expires}; SameSite=Lax`;
                
                console.log('✅ Client-side fallback: frappe_sid cookie set (sid name is blocked by browser)');
              } catch (e) {
                console.error('❌ Failed to set session cookie client-side:', e);
              }
            }
            
            if (!serverUser) {
              try {
                Cookies.set('frappe_user', username, cookieOptions);
                const expires = rememberMe 
                  ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString()
                  : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
                document.cookie = `frappe_user=${encodeURIComponent(username)}; path=/; expires=${expires}; SameSite=Lax`;
                console.log('✅ Client-side fallback: frappe_user cookie set');
              } catch (e) {
                console.error('❌ Failed to set frappe_user cookie client-side:', e);
              }
            }
            
            // Verify again after fallback (wait a bit more)
            setTimeout(() => {
              const finalSid = Cookies.get('sid') || Cookies.get('frappe_sid') || 
                document.cookie.split(';').find(c => {
                  const trimmed = c.trim();
                  return trimmed.startsWith('sid=') || trimmed.startsWith('frappe_sid=');
                })?.split('=')[1]?.trim();
              const finalUser = Cookies.get('frappe_user') || document.cookie.split(';').find(c => c.trim().startsWith('frappe_user='))?.split('=')[1]?.trim();
              
              if (finalSid && finalUser) {
                console.log('✅ Cookies verified after fallback:', {
                  sid: finalSid.substring(0, 10) + '...',
                  user: finalUser,
                  cookieName: Cookies.get('frappe_sid') ? 'frappe_sid' : (Cookies.get('sid') ? 'sid' : 'document.cookie')
                });
              } else {
                console.error('❌ Cookies still not set after fallback:', {
                  hasSid: !!finalSid,
                  hasUser: !!finalUser,
                  cookieNames: document.cookie.split(';').map(c => c.trim().split('=')[0]).join(', ')
                });
              }
            }, 100);
          }
        }, 300);
        
        // Note: Audit logging removed - frappe.utils.logger.log doesn't exist
        // If audit logging is needed, implement a custom endpoint in megatechtrackers
      } else {
        // Return rejected promise instead of throwing to avoid Next.js error overlay in dev
        return Promise.reject(new Error('Login failed'));
      }
    } catch (error: any) {
      console.error('Login error:', error);
      // Return rejected promise instead of throwing to avoid Next.js error overlay in dev
      return Promise.reject(new Error(error.response?.data?.message || 'Login failed'));
    }
  };

  const logout = async () => {
    const currentUser = user;
    
    // Remove cookies via js-cookie (both names)
    Cookies.remove('sid', { path: '/' });
    Cookies.remove('frappe_sid', { path: '/' });
    Cookies.remove('frappe_user', { path: '/' });
    
    // Also remove via document.cookie
    document.cookie = 'sid=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'frappe_sid=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'frappe_user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    
    setUser(null);
    setLoading(false);
    
    // Also logout from Frappe
    try {
      await axios.post(`/api/frappe/method/logout`, {}, {
        withCredentials: true
      }).catch(() => {});
      
      // Note: Audit logging removed - frappe.utils.logger.log doesn't exist
      // If audit logging is needed, implement a custom endpoint in megatechtrackers
    } catch (e) {
      // Ignore errors
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
