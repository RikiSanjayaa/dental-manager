import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { api, getToken, type UserMe } from "./lib/api";
import { brandName } from "./lib/brand";
import { AttendancePage } from "./pages/AttendancePage";
import { DashboardPage } from "./pages/DashboardPage";
import { DoctorFeesPage } from "./pages/DoctorFeesPage";
import { LoginPage } from "./pages/LoginPage";
import { MasterDataPage } from "./pages/MasterDataPage";
import { PayrollPage } from "./pages/PayrollPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";

function Protected() {
  const token = getToken();
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

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/doctor-fees" element={<DoctorFeesPage />} />
        <Route path="/payroll" element={<PayrollPage />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/master-data" element={<MasterDataPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
