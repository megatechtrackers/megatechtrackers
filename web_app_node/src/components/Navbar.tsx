'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';

interface NavbarProps {
  user: string | null;
}

interface Notification {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  timestamp: Date;
  read: boolean;
}

export function Navbar({ user }: NavbarProps) {
  const { logout } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  useEffect(() => {
    // Load notifications (can be extended to fetch from API)
    // For now, using localStorage for demo
    const stored = localStorage.getItem('notifications');
    if (stored) {
      try {
        const parsed = JSON.parse(stored).map((n: any) => ({
          ...n,
          timestamp: new Date(n.timestamp)
        }));
        setNotifications(parsed);
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, [user]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications((prev: Notification[]) => {
      const updated = prev.map((n: Notification) => n.id === id ? { ...n, read: true } : n);
      localStorage.setItem('notifications', JSON.stringify(updated));
      return updated;
    });
  };

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <nav style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: isMobile ? '1rem' : '1rem 2rem',
      background: '#fff',
      borderBottom: '1px solid #e0e0e0',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      position: 'sticky',
      top: 0,
      zIndex: 1000
    }}>
      {/* Logo/Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 600, color: '#0070f3' }}>
          Megatechtrackers
        </h1>
      </div>

      {/* Right side items */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        {!user ? (
          <button
            className="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.9rem'
            }}
          >
            Sign In
          </button>
        ) : (
          <>
            {/* Notifications */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.5rem',
                  position: 'relative',
                  fontSize: '1.25rem'
                }}
                aria-label="Notifications"
              >
                🔔
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    background: '#ff4444',
                    color: 'white',
                    borderRadius: '50%',
                    width: '18px',
                    height: '18px',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: '0.5rem',
                  background: 'white',
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  minWidth: '300px',
                  maxWidth: '400px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                  zIndex: 1000
                }}>
                  <div style={{ padding: '1rem', borderBottom: '1px solid #e0e0e0' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Notifications</h3>
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>
                      No notifications
                    </div>
                  ) : (
                    <div>
                      {notifications.map((notification: Notification) => (
                        <div
                          key={notification.id}
                          onClick={() => markAsRead(notification.id)}
                          style={{
                            padding: '0.75rem 1rem',
                            borderBottom: '1px solid #f0f0f0',
                            cursor: 'pointer',
                            background: notification.read ? 'transparent' : '#f8f9fa'
                          }}
                        >
                          <div style={{ fontSize: '0.875rem', color: '#333' }}>
                            {notification.message}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                            {notification.timestamp.toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* User Menu */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: 'none',
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px',
                  padding: '0.5rem 1rem',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                <span style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#0070f3',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600
                }}>
                  {user.charAt(0).toUpperCase()}
                </span>
                <span>{user}</span>
                <span>▼</span>
              </button>
              {showUserMenu && (
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: '0.5rem',
                  background: 'white',
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  minWidth: '200px',
                  overflow: 'hidden'
                }}>
                  <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #e0e0e0' }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{user}</p>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#666' }}>
                      {user}
                    </p>
                  </div>
                  <button
                    onClick={logout}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.75rem 1rem',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      color: '#ff4444'
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </nav>
  );
}
