import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { configured } from './lib/supabase.js';
import { AppProvider, useApp } from './lib/ctx.jsx';
import Layout from './components/Layout.jsx';
import { AlmostReady, NoAccess, SignIn, SetPassword } from './pages/Auth.jsx';
import { Loading, Empty } from './components/ui.jsx';
import Collections from './pages/Collections.jsx';
import Detail from './pages/Detail.jsx';
import Request from './pages/Request.jsx';
import DriverDay from './pages/DriverDay.jsx';
import { Account, More, Notifications } from './pages/Account.jsx';

const Deposits = lazy(() => import('./pages/Deposits.jsx'));
const DepositNew = lazy(() => import('./pages/Deposits.jsx').then((m) => ({ default: m.DepositNew })));
const DepositDetail = lazy(() => import('./pages/Deposits.jsx').then((m) => ({ default: m.DepositDetail })));
const Bank = lazy(() => import('./pages/Bank.jsx'));
const Statement = lazy(() => import('./pages/Bank.jsx').then((m) => ({ default: m.Statement })));
const ExportBC = lazy(() => import('./pages/BC.jsx'));
const BCCheck = lazy(() => import('./pages/BC.jsx').then((m) => ({ default: m.BCCheck })));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const Customers = lazy(() => import('./pages/Customers.jsx'));
const People = lazy(() => import('./pages/Admin.jsx'));
const Settings = lazy(() => import('./pages/Admin.jsx').then((m) => ({ default: m.Settings })));
const Photos = lazy(() => import('./pages/Admin.jsx').then((m) => ({ default: m.Photos })));
const Overview = lazy(() => import('./pages/Overview.jsx'));

function Only({ roles, children }) {
  const { role, settings } = useApp();
  const ok = roles.includes(role) || (roles.includes('driver-deposit') && role === 'driver' && settings?.drivers_can_deposit);
  if (!ok) return <div className="content"><Empty title="Not available">This page isn't part of your role.</Empty></div>;
  return children;
}

function Home() {
  const { role } = useApp();
  if (role === 'driver') return <Navigate to="/day" replace />;
  if (role === 'executive') return <Navigate to="/overview" replace />;
  return <Navigate to="/collections" replace />;
}

function Gate() {
  const { session, me, loaded, loadErr, recovery, role } = useApp();
  if (session === undefined || (session && !loaded)) return <Loading text="Opening…" />;
  if (recovery) return <SetPassword />;
  if (!session) return <SignIn />;
  if (loadErr && !me) return <NoAccess error={loadErr} />;
  if (!me || !role) return <NoAccess />;
  return (
    <Layout>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/new" element={<Only roles={['sales', 'finance']}><Request /></Only>} />
          <Route path="/c/:id" element={<Detail />} />
          <Route path="/c/:id/edit" element={<Only roles={['sales', 'finance']}><Request /></Only>} />
          <Route path="/day" element={<Only roles={['driver', 'finance']}><DriverDay /></Only>} />
          <Route path="/deposits" element={<Only roles={['finance', 'executive', 'driver-deposit']}><Deposits /></Only>} />
          <Route path="/deposits/new" element={<Only roles={['finance', 'driver-deposit']}><DepositNew /></Only>} />
          <Route path="/deposits/:id" element={<Only roles={['finance', 'executive', 'driver-deposit']}><DepositDetail /></Only>} />
          <Route path="/bank" element={<Only roles={['finance', 'executive']}><Bank /></Only>} />
          <Route path="/bank/:id" element={<Only roles={['finance', 'executive']}><Statement /></Only>} />
          <Route path="/export" element={<Only roles={['finance', 'executive']}><ExportBC /></Only>} />
          <Route path="/bc-check" element={<Only roles={['finance', 'executive']}><BCCheck /></Only>} />
          <Route path="/reports" element={<Only roles={['finance', 'executive', 'sales']}><Reports /></Only>} />
          <Route path="/customers" element={<Only roles={['finance']}><Customers /></Only>} />
          <Route path="/people" element={<Only roles={['finance']}><People /></Only>} />
          <Route path="/settings" element={<Only roles={['finance']}><Settings /></Only>} />
          <Route path="/photos" element={<Only roles={['finance']}><Photos /></Only>} />
          <Route path="/overview" element={<Only roles={['finance', 'executive']}><Overview /></Only>} />
          <Route path="/account" element={<Account />} />
          <Route path="/more" element={<More />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="*" element={<div className="content"><Empty title="Page not found">Use the menu to find your way.</Empty></div>} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

export default function App() {
  if (!configured) return <AlmostReady />;
  return (
    <AppProvider>
      <Gate />
    </AppProvider>
  );
}
