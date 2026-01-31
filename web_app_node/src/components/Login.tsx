'use client';

import { useState } from 'react';
import axios from 'axios';

interface LoginProps {
  onLogin: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
}

const FRAPPE_URL = process.env.NEXT_PUBLIC_FRAPPE_URL || 'http://localhost:8000';

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onLogin(username, password, rememberMe);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotPasswordMessage('');
    setForgotPasswordLoading(true);

    try {
      // Frappe password reset API (using Next.js proxy to avoid CORS)
      await axios.post(`/api/frappe/method/frappe.core.doctype.user.user.reset_password`, {
        user: forgotPasswordEmail || username
      });

      setForgotPasswordMessage('Password reset link has been sent to your email address if the account exists.');
      setForgotPasswordEmail('');
      setTimeout(() => {
        setShowForgotPassword(false);
        setForgotPasswordMessage('');
      }, 3000);
    } catch (err: any) {
      setForgotPasswordMessage(err.response?.data?.message || 'Failed to send password reset. Please try again or contact your administrator.');
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '1rem'
    }}>
      <div style={{ 
        width: '100%',
        maxWidth: '400px',
        background: 'white', 
        color: '#333',
        borderRadius: '8px',
        padding: '2rem',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem', fontWeight: 600, color: '#0070f3' }}>
            Megatechtrackers
          </h1>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 400, color: '#666' }}>Sign In</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="username" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem'
              }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="password" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem'
              }}
            />
          </div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '1.5rem'
          }}>
            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ marginRight: '0.5rem', cursor: 'pointer' }}
              />
              Remember me
            </label>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setShowForgotPassword(true);
              }}
              style={{
                color: '#0070f3',
                textDecoration: 'none',
                fontSize: '0.9rem'
              }}
            >
              Forgot password?
            </a>
          </div>
          {error && <div className="error">{error}</div>}
          <button
            type="submit"
            className="button"
            disabled={loading}
            style={{ width: '100%', marginTop: '0.5rem' }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Forgot Password Modal */}
        {showForgotPassword && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: 'white',
              borderRadius: '8px',
              padding: '2rem',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
            }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: 600 }}>
                Reset Password
              </h3>
              <form onSubmit={handleForgotPassword}>
                <div style={{ marginBottom: '1rem' }}>
                  <label htmlFor="reset-email" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    Username or Email
                  </label>
                  <input
                    id="reset-email"
                    type="text"
                    value={forgotPasswordEmail || username}
                    onChange={(e) => setForgotPasswordEmail(e.target.value)}
                    placeholder="Enter your username or email"
                    required
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem'
                    }}
                  />
                </div>
                {forgotPasswordMessage && (
                  <div style={{
                    padding: '0.75rem',
                    borderRadius: '4px',
                    marginBottom: '1rem',
                    fontSize: '0.875rem',
                    backgroundColor: forgotPasswordMessage.includes('sent') ? '#d4edda' : '#f8d7da',
                    color: forgotPasswordMessage.includes('sent') ? '#155724' : '#721c24',
                    border: `1px solid ${forgotPasswordMessage.includes('sent') ? '#c3e6cb' : '#f5c6cb'}`
                  }}>
                    {forgotPasswordMessage}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setForgotPasswordEmail('');
                      setForgotPasswordMessage('');
                    }}
                    style={{
                      padding: '0.5rem 1rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      background: 'white',
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotPasswordLoading}
                    style={{
                      padding: '0.5rem 1rem',
                      border: 'none',
                      borderRadius: '4px',
                      background: '#0070f3',
                      color: 'white',
                      cursor: forgotPasswordLoading ? 'not-allowed' : 'pointer',
                      fontSize: '0.9rem',
                      opacity: forgotPasswordLoading ? 0.6 : 1
                    }}
                  >
                    {forgotPasswordLoading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
