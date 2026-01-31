'use client';

import { useState, useEffect } from 'react';
import { Form, Report } from '@/types';
import { generateEmbedUrl } from '@/lib/api';

interface ContentAreaProps {
  selectedForm?: Form;
  selectedReport?: Report;
  user: string;
}

export function ContentArea({ selectedForm, selectedReport, user }: ContentAreaProps) {
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const FRAPPE_URL = process.env.NEXT_PUBLIC_FRAPPE_URL || 'http://localhost:8000';

  useEffect(() => {
    if (selectedReport) {
      loadReport();
    } else {
      setEmbedUrl(null);
      setError(null);
    }
  }, [selectedReport]);

  const loadReport = async () => {
    if (!selectedReport) return;

    setLoading(true);
    setError(null);

    try {
      const url = await generateEmbedUrl({
        reportId: selectedReport.id,
        reportUid: selectedReport.uid,
        filters: selectedReport.context || {},
        frappeUser: user
      });
      setEmbedUrl(url);
    } catch (err: any) {
      setError(err.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  // Show form if selected
  if (selectedForm) {
    // Construct form URL - ensure it's absolute and points to Frappe
    let formUrl: string;
    if (selectedForm.url) {
      // If URL is relative (starts with /), prepend Frappe URL
      if (selectedForm.url.startsWith('/')) {
        formUrl = `${FRAPPE_URL}${selectedForm.url}`;
      } else if (selectedForm.url.startsWith('http://') || selectedForm.url.startsWith('https://')) {
        // Already absolute URL
        formUrl = selectedForm.url;
      } else {
        // Fallback: construct from form name
        formUrl = `${FRAPPE_URL}/app/${selectedForm.name}`;
      }
    } else {
      // No URL provided, construct from form name
      formUrl = `${FRAPPE_URL}/app/${selectedForm.name}`;
    }

    return (
      <div style={{
        flex: 1,
        height: 'calc(100vh - 64px)',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff'
      }}>
        <div style={{
          flex: 1,
          border: 'none',
          overflow: 'hidden'
        }}>
          <iframe
            src={formUrl}
            title={selectedForm.label || selectedForm.name}
            style={{
              width: '100%',
              height: '100%',
              border: 'none'
            }}
            allow="fullscreen"
          />
        </div>
      </div>
    );
  }

  // Show report if selected
  if (selectedReport) {
    return (
      <div style={{
        flex: 1,
        height: 'calc(100vh - 64px)',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff'
      }}>
        <div style={{
          flex: 1,
          border: 'none',
          overflow: 'hidden',
          position: 'relative'
        }}>
          {loading ? (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center'
            }}>
              <div className="loading">Loading report...</div>
            </div>
          ) : error ? (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              padding: '2rem'
            }}>
              <div className="error">{error}</div>
              <button
                className="button"
                onClick={loadReport}
                style={{ marginTop: '1rem' }}
              >
                Retry
              </button>
            </div>
          ) : embedUrl ? (
            <iframe
              src={embedUrl}
              title={selectedReport.name}
              style={{
                width: '100%',
                height: '100%',
                border: 'none'
              }}
              allow="fullscreen"
            />
          ) : null}
        </div>
      </div>
    );
  }

  // Empty state
  return (
    <div style={{
      flex: 1,
      height: 'calc(100vh - 64px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f8f9fa',
      color: '#666'
    }}>
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📄</div>
        <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: '#333', marginBottom: '0.5rem' }}>
          Select an Item
        </h3>
        <p style={{ margin: '1rem 0 0 0', fontSize: '1rem', color: '#666', lineHeight: '1.5' }}>
          Choose a form or report from the sidebar to view it here
        </p>
      </div>
    </div>
  );
}
