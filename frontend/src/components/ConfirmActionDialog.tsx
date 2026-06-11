import { Button } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { AlertTriangle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  isPending?: boolean;
  icon?: LucideIcon;
  variant?: "warning" | "danger";
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  children?: ReactNode;
};

const styles = {
  warning: {
    iconBg: "bg-amber-500/20",
    iconColor: "text-amber-500",
    buttonStyle: { background: "#d97706", color: "#ffffff", borderColor: "#b45309" } as const,
  },
  danger: {
    iconBg: "bg-kumo-danger/20",
    iconColor: "text-kumo-danger",
    buttonStyle: {} as const,
  },
};

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel = "Konfirmasi",
  isPending = false,
  icon: Icon = AlertTriangle,
  variant = "warning",
  onOpenChange,
  onConfirm,
  children,
}: Props) {
  const theme = styles[variant];

  return (
    <Dialog.Root disablePointerDismissal open={open} onOpenChange={onOpenChange}>
      <Dialog size="lg" className="p-0">
        <div className="flex items-center gap-3 border-b border-kumo-line px-6 py-4">
          <div className={`flex h-9 w-9 items-center justify-center rounded-full ${theme.iconBg}`}>
            <Icon size={18} className={theme.iconColor} />
          </div>
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
        </div>
        <div className="flex flex-col gap-4 p-6">
          <Dialog.Description className="text-base leading-6 text-kumo-subtle">
            {description}
          </Dialog.Description>
          {children}
        </div>
        <div className="flex justify-end gap-3 border-t border-kumo-line px-6 py-4">
          <Dialog.Close render={(props) => <Button variant="secondary" {...props}>Batal</Button>} />
          <Button
            variant={variant === "danger" ? "destructive" : "primary"}
            className="inline-flex items-center gap-2"
            style={variant === "warning" ? theme.buttonStyle : undefined}
            loading={isPending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
