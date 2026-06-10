import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Checkbox } from "@cloudflare/kumo/components/checkbox";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { SensitiveInput } from "@cloudflare/kumo/components/sensitive-input";
import { Switch } from "@cloudflare/kumo/components/switch";
import { Text } from "@cloudflare/kumo/components/text";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stethoscope } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { login } from "../lib/api";
import { brandName, brandShortName } from "../lib/brand";

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
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
    <main className="min-h-screen bg-kumo-canvas" data-theme="kumo">
      <header
        className="fixed inset-x-0 z-10 flex items-center justify-between"
        style={{ paddingLeft: 28, paddingRight: 28, top: 24 }}
      >
        <div className="flex items-center gap-2 text-kumo-brand">
          <Stethoscope size={30} />
          <Text as="span" variant="body" bold>
            {brandShortName}
          </Text>
        </div>

        <Switch
          size="sm"
          variant="neutral"
          label={mode === "dark" ? "Dark" : "Light"}
          controlFirst={false}
          checked={mode === "dark"}
          onCheckedChange={(checked) => setMode(checked ? "dark" : "light")}
        />
      </header>

      <section
        className="fixed inset-0 px-4"
        style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <div className="grid gap-4" style={{ width: "100%", maxWidth: 450 }}>
          <LayerCard className="grid gap-6 p-6 shadow-sm md:p-8" style={{ width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div
                className="grid place-items-center rounded-full bg-kumo-brand text-white"
                style={{ alignItems: "center", display: "grid", height: 48, justifyItems: "center", width: 48 }}
              >
                <Stethoscope size={28} />
              </div>
            </div>

            <Text as="h1" variant="heading2">
              Sign in to {brandName}
            </Text>

            {mutation.isError ? (
              <Banner
                variant="error"
                title="Login gagal"
                description={mutation.error instanceof Error ? mutation.error.message : "Periksa server dan kredensial akun."}
              />
            ) : null}

            <form onSubmit={submit} className="grid gap-4">
              <Input
                label="Username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
              <SensitiveInput
                label="Password"
                autoComplete="current-password"
                value={password}
                onValueChange={setPassword}
              />
              <Checkbox
                label="Remember me"
                checked={remember}
                onCheckedChange={(checked) => setRemember(Boolean(checked))}
              />
              <Button type="submit" variant="primary" className="w-full justify-center text-center" loading={mutation.isPending}>
                Sign in
              </Button>
            </form>

            <Button type="button" variant="ghost" className="w-full justify-center text-center">
              Reset password
            </Button>
          </LayerCard>

          <Text as="p" variant="secondary" size="sm" DANGEROUS_className="block text-center">
            Hubungi administrator jika belum mempunyai akun.
          </Text>
        </div>
      </section>
    </main>
  );
}
