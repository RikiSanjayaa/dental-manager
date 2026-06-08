import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { InputGroup } from "@cloudflare/kumo/components/input-group";
import { Sidebar, useSidebar } from "@cloudflare/kumo/components/sidebar";
import { Text } from "@cloudflare/kumo/components/text";
import {
  type LucideIcon,
  ClipboardList,
  ClipboardPlus,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Moon,
  ReceiptText,
  Search,
  Settings,
  Stethoscope,
  Sun,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { setToken, type UserMe } from "../lib/api";
import { brandName } from "../lib/brand";

type Props = {
  user: UserMe;
};

const nav: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/treatment-history", label: "Riwayat Perawatan", icon: ClipboardPlus },
  { to: "/doctor-fees", label: "Fee Dokter", icon: Stethoscope },
  { to: "/payroll", label: "Payroll", icon: ReceiptText },
  { to: "/attendance", label: "Absensi", icon: ClipboardList },
  { to: "/master-data", label: "Master Data", icon: Users },
  { to: "/reports", label: "Laporan", icon: FileSpreadsheet },
  { to: "/settings", label: "Pengaturan", icon: Settings },
];

const SIDEBAR_WIDTH = 260;
const SIDEBAR_COLLAPSED_WIDTH = 57;

export function AppShell({ user }: Props) {
  return (
    <Sidebar.Provider
      defaultOpen
      collapsible="icon"
      defaultWidth={SIDEBAR_WIDTH}
      mobileBreakpoint={0}
      className="h-screen overflow-hidden bg-kumo-canvas"
      data-theme="kumo"
      style={{ height: "100vh" }}
    >
      <AppShellFrame user={user} />
    </Sidebar.Provider>
  );
}

function AppShellFrame({ user }: Props) {
  const { state } = useSidebar();
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
  const sidebarOffset =
    state === "expanded" ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH;

  return (
    <>
      <Sidebar
        className="app-sidebar fixed top-0 bottom-0 left-0 z-30"
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
              {nav.map((item) => {
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
              onClick={() => {
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
        className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-kumo-canvas transition-[margin-left]"
        style={{ marginLeft: sidebarOffset, height: "100vh" }}
      >
        <header
          className="sticky top-0 z-20 flex items-center gap-3 border-b border-kumo-hairline bg-kumo-base px-5"
          style={{
            height: 56,
            minHeight: 56,
            paddingLeft: 20,
            paddingRight: 20,
          }}
        >
          <Sidebar.Trigger aria-label="Toggle sidebar" />

          <InputGroup className="min-w-0 flex-1" style={{ maxWidth: 540 }}>
            <InputGroup.Addon>
              <Search size={16} />
            </InputGroup.Addon>
            <InputGroup.Input aria-label="Search" placeholder="Search..." />
          </InputGroup>

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
              className="flex items-center gap-2 border-l border-kumo-hairline pl-3"
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
                <Badge variant="info">{user.role}</Badge>
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
          className="mx-auto flex w-full flex-col gap-5 px-6 py-6"
          style={{ maxWidth: 1280 }}
        >
          <Outlet />
          <div aria-hidden="true" style={{ height: 16, flex: "0 0 16px" }} />
        </div>
      </main>
    </>
  );
}
