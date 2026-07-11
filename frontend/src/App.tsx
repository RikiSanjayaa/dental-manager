import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { api, getToken, type UserMe } from "./lib/api";
import { isAdministrator } from "./lib/auth";
import { useBrand } from "./lib/brand";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { AttendancePage } from "./pages/AttendancePage";
import { DashboardPage } from "./pages/DashboardPage";
import { DoctorFeesPage } from "./pages/DoctorFeesPage";
import { LoginPage } from "./pages/LoginPage";
import { MasterDataPage } from "./pages/MasterDataPage";
import { MyPayrollPage } from "./pages/MyPayrollPage";
import { OperatorDashboardPage } from "./pages/OperatorDashboardPage";
import { PayrollPage } from "./pages/PayrollPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TreatmentHistoryPage } from "./pages/TreatmentHistoryPage";
import { UsersPage } from "./pages/UsersPage";

function Protected() {
  const token = getToken();
  const { brandName } = useBrand();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<UserMe>("/auth/me"),
    enabled: Boolean(token),
    retry: false,
  });

  if (!token || isError) return <Navigate to="/login" replace />;
  if (isLoading || !data) {
    return <div className="grid min-h-screen place-items-center bg-kumo-canvas text-kumo-subtle">Memuat {brandName}...</div>;
  }
  return <AppShell user={data} />;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<UserMe>("/auth/me"),
    enabled: Boolean(getToken()),
    retry: false,
  });

  if (!data) return null;
  if (!isAdministrator(data)) return <Navigate to="/" replace />;
  return children;
}

function OperatorRoute({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<UserMe>("/auth/me"),
    enabled: Boolean(getToken()),
    retry: false,
  });

  if (!data) return null;
  if (isAdministrator(data)) return <Navigate to="/" replace />;
  return children;
}

function HomeRoute() {
  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<UserMe>("/auth/me"),
    enabled: Boolean(getToken()),
    retry: false,
  });

  if (!data) return null;
  return isAdministrator(data) ? <DashboardPage /> : <OperatorDashboardPage />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected />}>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/treatment-history" element={<TreatmentHistoryPage />} />
        <Route path="/doctor-fees" element={<AdminRoute><DoctorFeesPage /></AdminRoute>} />
        <Route path="/payroll" element={<AdminRoute><PayrollPage /></AdminRoute>} />
        <Route path="/my-payroll" element={<OperatorRoute><MyPayrollPage /></OperatorRoute>} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/master-data" element={<AdminRoute><MasterDataPage /></AdminRoute>} />
        <Route path="/reports" element={<AdminRoute><ReportsPage /></AdminRoute>} />
        <Route path="/users" element={<AdminRoute><UsersPage /></AdminRoute>} />
        <Route path="/audit-logs" element={<AdminRoute><AuditLogsPage /></AdminRoute>} />
        <Route path="/my-audit-logs" element={<OperatorRoute><AuditLogsPage selfOnly /></OperatorRoute>} />
        <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
      </Route>
    </Routes>
  );
}
