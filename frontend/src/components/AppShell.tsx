import { Badge } from "@cloudflare/kumo/components/badge";
import { Breadcrumbs } from "@cloudflare/kumo/components/breadcrumbs";
import { Button } from "@cloudflare/kumo/components/button";
import { Sidebar, useSidebar } from "@cloudflare/kumo/components/sidebar";
import { Text } from "@cloudflare/kumo/components/text";
import {
  type LucideIcon,
  ClipboardList,
  ClipboardPlus,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  LogOut,
  Moon,
  ReceiptText,
  Settings,
  Stethoscope,
  Sun,
  Users,
  UserCog,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { api, setToken, type UserMe } from "../lib/api";
import { isAdministrator, roleLabel } from "../lib/auth";
import { useBrand } from "../lib/brand";

type Props = {
  user: UserMe;
};

const nav: Array<{ to: string; label: string; icon: LucideIcon; adminOnly?: boolean; operatorOnly?: boolean }> = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/treatment-history", label: "Riwayat Perawatan", icon: ClipboardPlus },
  { to: "/doctor-fees", label: "Fee Dokter", icon: Stethoscope, adminOnly: true },
  { to: "/attendance", label: "Absensi", icon: ClipboardList },
  { to: "/payroll", label: "Payroll", icon: ReceiptText, adminOnly: true },
  { to: "/my-payroll", label: "Payroll Saya", icon: ReceiptText, operatorOnly: true },
  { to: "/master-data", label: "Master Data", icon: Users, adminOnly: true },
  { to: "/reports", label: "Laporan", icon: FileSpreadsheet, adminOnly: true },
  { to: "/users", label: "User Management", icon: UserCog, adminOnly: true },
  { to: "/audit-logs", label: "Audit Logs", icon: History, adminOnly: true },
  { to: "/my-audit-logs", label: "Audit Akun", icon: History, operatorOnly: true },
  { to: "/settings", label: "Pengaturan", icon: Settings, adminOnly: true },
];

const SIDEBAR_WIDTH = 260;
const SIDEBAR_COLLAPSED_WIDTH = 57;

export function AppShell({ user }: Props) {
  return (
    <Sidebar.Provider
      defaultOpen
      collapsible="icon"
      defaultWidth={SIDEBAR_WIDTH}
      className="h-screen overflow-hidden bg-kumo-canvas"
      data-theme="kumo"
      style={{ height: "100vh" }}
    >
      <AppShellFrame user={user} />
    </Sidebar.Provider>
  );
}

function AppShellFrame({ user }: Props) {
  const { isMobile, state } = useSidebar();
  const { brandName } = useBrand();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<"light" | "dark">(() => {
    return localStorage.getItem("dental_manager_mode") === "dark"
      ? "dark"
      : "light";
  });
  const [logoutHovered, setLogoutHovered] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
    localStorage.setItem("dental_manager_mode", mode);
  }, [mode]);

  const initials = useMemo(() => {
    return user.full_name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [user.full_name]);
  const sidebarOffset = isMobile
    ? 0
    : state === "expanded" ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH;
  const activeNav = nav.find((item) =>
    item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to),
  );
  const visibleNav = nav.filter((item) => {
    if (item.adminOnly) return isAdministrator(user);
    if (item.operatorOnly) return !isAdministrator(user);
    return true;
  });

  return (
    <>
      <Sidebar
        className="app-sidebar"
        style={{ height: "100vh" }}
      >
        <Sidebar.Header>
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid size-8 shrink-0 place-items-center text-kumo-brand">
              <Stethoscope size={24} />
            </div>
            <Text
              as="strong"
              variant="body"
              bold
              truncate
              DANGEROUS_className="block min-w-0"
            >
              {brandName}
            </Text>
          </div>
        </Sidebar.Header>

        <Sidebar.Content>
          <Sidebar.Group>
            <Sidebar.Menu className="app-sidebar-menu">
              {visibleNav.map((item) => {
                const active =
                  item.to === "/"
                    ? location.pathname === "/"
                    : location.pathname.startsWith(item.to);
                return (
                  <Sidebar.MenuButton
                    key={item.to}
                    active={active}
                    icon={item.icon}
                    tooltip={state === "expanded" ? undefined : item.label}
                    onClick={() => navigate(item.to)}
                  >
                    {item.label}
                  </Sidebar.MenuButton>
                );
              })}
            </Sidebar.Menu>
          </Sidebar.Group>
        </Sidebar.Content>

        <Sidebar.Footer>
          <Sidebar.Menu className="app-sidebar-menu app-sidebar-footer-menu">
            <Sidebar.MenuButton
              className="app-sidebar-logout"
              icon={LogOut}
              onBlur={() => setLogoutHovered(false)}
              onFocus={() => setLogoutHovered(true)}
              onMouseEnter={() => setLogoutHovered(true)}
              onMouseLeave={() => setLogoutHovered(false)}
              onPointerEnter={() => setLogoutHovered(true)}
              onPointerLeave={() => setLogoutHovered(false)}
              style={
                logoutHovered
                  ? {
                      backgroundColor:
                        "color-mix(in oklab, var(--color-kumo-danger-tint) 72%, transparent)",
                      color: "var(--text-color-kumo-danger)",
                    }
                  : undefined
              }
              onClick={async () => {
                try {
                  await api("/auth/logout", { method: "POST" });
                } catch {
                  // Token removal is still the source of truth for local logout.
                }
                setToken(null);
                navigate("/login");
              }}
            >
              Keluar
            </Sidebar.MenuButton>
          </Sidebar.Menu>
        </Sidebar.Footer>
      </Sidebar>

      <main
        className="app-main flex min-w-0 flex-1 flex-col overflow-y-auto bg-kumo-canvas transition-[margin-left]"
        style={{ marginLeft: sidebarOffset, height: "100vh" }}
      >
        <header
          className="sticky top-0 z-20 flex items-center gap-3 border-b border-kumo-hairline bg-kumo-base px-5"
          style={{
            height: 56,
            minHeight: 56,
            paddingLeft: isMobile ? 12 : 20,
            paddingRight: isMobile ? 12 : 20,
          }}
        >
          <Sidebar.Trigger aria-label="Toggle sidebar" />

          <Breadcrumbs size="sm" className="min-w-0 flex-1">
            <Breadcrumbs.Link href="/">{brandName}</Breadcrumbs.Link>
            <Breadcrumbs.Separator />
            <Breadcrumbs.Current>{activeNav?.label ?? "Halaman"}</Breadcrumbs.Current>
          </Breadcrumbs>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              shape="square"
              aria-label={
                mode === "dark" ? "Gunakan mode terang" : "Gunakan mode gelap"
              }
              icon={mode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              onClick={() =>
                setMode((current) => (current === "dark" ? "light" : "dark"))
              }
            />

            <div
              className="hidden items-center gap-2 border-l border-kumo-hairline pl-3 sm:flex"
              style={{ width: 190 }}
            >
              <div className="grid min-w-0 flex-1 justify-items-end">
                <Text
                  as="strong"
                  variant="body"
                  bold
                  size="sm"
                  truncate
                  DANGEROUS_className="block max-w-full"
                >
                  {user.full_name}
                </Text>
                <Badge variant="info">{roleLabel(user.role)}</Badge>
              </div>
              <span
                className="shrink-0 bg-kumo-brand text-xs font-semibold text-white"
                style={{
                  alignItems: "center",
                  borderRadius: 9999,
                  display: "inline-flex",
                  height: 32,
                  justifyContent: "center",
                  lineHeight: 1,
                  width: 32,
                }}
              >
                {initials}
              </span>
            </div>
          </div>
        </header>
        <div
          className="app-content mx-auto flex w-full flex-col gap-5 px-6 pt-8 pb-6"
          style={{ maxWidth: 1280 }}
        >
          <Outlet context={{ user }} />
          <div aria-hidden="true" style={{ height: 16, flex: "0 0 16px" }} />
        </div>
      </main>
    </>
  );
}
