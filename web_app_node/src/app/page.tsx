'use client';

import { useEffect, useState, lazy, Suspense } from 'react';
import { useAuth } from '@/lib/auth';
import { Navbar } from '@/components/Navbar';
import { Sidebar } from '@/components/Sidebar';
import { Loading } from '@/components/Loading';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { getUserPermissions } from '@/lib/api';
import { Form, Report } from '@/types';

// Lazy load components for better performance
const ContentArea = lazy(() => import('@/components/ContentArea').then(m => ({ default: m.ContentArea })));
const Login = lazy(() => import('@/components/Login').then(m => ({ default: m.Login })));

export default function Home() {
  const { user, loading, login } = useAuth();
  const [isClient, setIsClient] = useState(false);
  const [permissions, setPermissions] = useState<{ forms: Form[]; reports: Report[] } | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);
  const [selectedForm, setSelectedForm] = useState<Form | undefined>();
  const [selectedReport, setSelectedReport] = useState<Report | undefined>();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (user) {
      loadPermissions();
    }
  }, [user]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const loadPermissions = async () => {
    if (!user) return;
    
    setPermissionsLoading(true);
    setPermissionsError(null);
    
    try {
      const data = await getUserPermissions(user);
      setPermissions({
        forms: data.forms || [],
        reports: data.reports || []
      });
    } catch (err: any) {
      setPermissionsError(err.message || 'Failed to load permissions');
    } finally {
      setPermissionsLoading(false);
    }
  };

  const handleFormSelect = (form: Form) => {
    setSelectedForm(form);
    setSelectedReport(undefined);
  };

  const handleReportSelect = (report: Report) => {
    setSelectedReport(report);
    setSelectedForm(undefined);
  };

  if (!isClient || loading) {
    return <Loading />;
  }

  if (!user) {
    return (
      <Suspense fallback={<Loading />}>
        <Login onLogin={(username: string, password: string, rememberMe?: boolean) => login(username, password, rememberMe)} />
      </Suspense>
    );
  }

  if (permissionsLoading) {
    return (
      <>
        <Navbar user={user} />
        <div style={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="loading">Loading permissions...</div>
          </div>
        </div>
      </>
    );
  }

  if (permissionsError) {
    return (
      <>
        <Navbar user={user} />
        <div style={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="error">{permissionsError}</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <ErrorBoundary>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <Navbar user={user} />
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: isMobile ? 'column' : 'row' }}>
          {permissions && (
            <>
              <Sidebar
                forms={permissions.forms}
                reports={permissions.reports}
                activeForm={selectedForm?.name}
                activeReport={selectedReport?.id}
                onFormSelect={handleFormSelect}
                onReportSelect={handleReportSelect}
              />
              <Suspense fallback={<div className="loading">Loading...</div>}>
                <ContentArea
                  selectedForm={selectedForm}
                  selectedReport={selectedReport}
                  user={user}
                />
              </Suspense>
            </>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
