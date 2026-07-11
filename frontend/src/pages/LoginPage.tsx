import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Checkbox } from "@cloudflare/kumo/components/checkbox";
import { Input } from "@cloudflare/kumo/components/input";
import { Switch } from "@cloudflare/kumo/components/switch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Stethoscope } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { login } from "../lib/api";
import { useBrand } from "../lib/brand";

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { brandName, brandShortName } = useBrand();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"light" | "dark">(() => {
    return localStorage.getItem("dental_manager_mode") === "dark" ? "dark" : "light";
  });
  const mutation = useMutation({
    mutationFn: () => login(username, password, remember),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/");
    },
  });

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
    localStorage.setItem("dental_manager_mode", mode);
  }, [mode]);

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <main className="login-root" data-theme="kumo">
      <aside className="login-hero">
        <img
          className="login-hero-photo"
          src="/login-clinic.jpg"
          alt="Ruang praktik dokter gigi"
        />
        <div className="login-hero-scrim" />

        <div className="login-hero-brand">
          <span className="login-hero-mark">
            <Stethoscope size={22} strokeWidth={2.2} />
          </span>
          {brandShortName}
        </div>

        <div className="login-hero-footer">
          &copy; {new Date().getFullYear()} {brandName}
        </div>
      </aside>

      <section className="login-panel">
        <div className="login-panel-topbar">
          <Switch
            size="sm"
            variant="neutral"
            label={mode === "dark" ? "Dark" : "Light"}
            controlFirst={false}
            checked={mode === "dark"}
            onCheckedChange={(checked) => setMode(checked ? "dark" : "light")}
          />
        </div>

        <div className="login-form-wrap">
          <div className="login-form-head">
            <p className="login-form-kicker">Selamat datang kembali</p>
            <h2 className="login-form-title">Masuk ke {brandName}</h2>
          </div>

          {mutation.isError ? (
            <div style={{ marginBottom: 18 }}>
              <Banner
                variant="error"
                title="Login gagal"
                description={mutation.error instanceof Error ? mutation.error.message : "Periksa server dan kredensial akun."}
              />
            </div>
          ) : null}

          <form onSubmit={submit} className="login-fields">
            <Input
              label="Username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
            <div className="login-password">
              <Input
                label="Password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <Checkbox
              label="Remember me"
              checked={remember}
              onCheckedChange={(checked) => setRemember(Boolean(checked))}
            />

            <div className="login-actions">
              <Button
                type="submit"
                variant="primary"
                className="w-full justify-center text-center"
                loading={mutation.isPending}
              >
                Sign in
              </Button>
            </div>
          </form>

          <div className="login-foot-note">
            <span style={{ color: "var(--text-color-kumo-subtle)", fontSize: 13 }}>
              Hubungi administrator jika lupa password atau belum mempunyai akun.
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
