'use client';

import { useState, useEffect } from 'react';
import { Form, Report } from '@/types';

interface SidebarProps {
  forms: Form[];
  reports: Report[];
  activeForm?: string;
  activeReport?: number;
  onFormSelect: (form: Form) => void;
  onReportSelect: (report: Report) => void;
}

export function Sidebar({ forms, reports, activeForm, activeReport, onFormSelect, onReportSelect }: SidebarProps) {
  const [formsExpanded, setFormsExpanded] = useState(true);
  const [reportsExpanded, setReportsExpanded] = useState(true);
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
    <aside style={{
      width: isMobile ? '100%' : '280px',
      background: '#f8f9fa',
      borderRight: isMobile ? 'none' : '1px solid #e0e0e0',
      height: isMobile ? 'auto' : 'calc(100vh - 64px)',
      overflowY: 'auto',
      position: isMobile ? 'relative' : 'sticky',
      top: isMobile ? '0' : '64px'
    }}>
      {forms.length === 0 && reports.length === 0 ? (
        <div style={{
          padding: '2rem 1rem',
          textAlign: 'center',
          color: '#666'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', fontWeight: 600, color: '#333' }}>
            No Access
          </h3>
          <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: '1.5' }}>
            You don't have any forms or reports assigned.{' '}
            Please contact your administrator to get access.
          </p>
        </div>
      ) : (
        <>
          {/* Forms Section (only if there are forms) */}
          {forms.length > 0 && (
            <div>
              <button
                onClick={() => setFormsExpanded(!formsExpanded)}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: formsExpanded ? '#e3f2fd' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #e0e0e0',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontWeight: 600,
                  fontSize: '0.95rem'
                }}
              >
                <span>📋 Forms ({forms.length})</span>
                <span>{formsExpanded ? '▼' : '▶'}</span>
              </button>
              {formsExpanded && (
                <div>
                  {forms.map((form) => (
                    <button
                      key={form.name}
                      onClick={() => onFormSelect(form)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.75rem 1rem 0.75rem 2rem',
                        background: activeForm === form.name ? '#e3f2fd' : 'transparent',
                        border: 'none',
                        borderBottom: '1px solid #f0f0f0',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        color: activeForm === form.name ? '#0070f3' : '#333'
                      }}
                    >
                      <span>{form.label || form.name}</span>
                      {form.inherited && (
                        <span style={{
                          fontSize: '0.75rem',
                          color: '#666',
                          background: '#fff',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px'
                        }}>
                          Inherited
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Reports Section (only if there are reports) */}
          {reports.length > 0 && (
            <div>
              <button
                onClick={() => setReportsExpanded(!reportsExpanded)}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: reportsExpanded ? '#e3f2fd' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #e0e0e0',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontWeight: 600,
                  fontSize: '0.95rem'
                }}
              >
                <span>📊 Reports ({reports.length})</span>
                <span>{reportsExpanded ? '▼' : '▶'}</span>
              </button>
              {reportsExpanded && (
                <div>
                  {reports.map((report) => (
                    <button
                      key={report.id}
                      onClick={() => onReportSelect(report)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.75rem 1rem 0.75rem 2rem',
                        background: activeReport === report.id ? '#e3f2fd' : 'transparent',
                        border: 'none',
                        borderBottom: '1px solid #f0f0f0',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        color: activeReport === report.id ? '#0070f3' : '#333'
                      }}
                    >
                      <span>{report.name}</span>
                      {report.inherited && (
                        <span style={{
                          fontSize: '0.75rem',
                          color: '#666',
                          background: '#fff',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px'
                        }}>
                          Inherited
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </aside>
  );
}
