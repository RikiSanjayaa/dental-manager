import { Button } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Trash2 } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  isDeleting?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function ConfirmDeleteDialog({
  open,
  title,
  description,
  confirmLabel = "Hapus",
  isDeleting = false,
  onOpenChange,
  onConfirm,
}: Props) {
  return (
    <Dialog.Root disablePointerDismissal open={open} onOpenChange={onOpenChange}>
      <Dialog size="lg" className="p-0">
        <div className="flex items-center gap-3 border-b border-kumo-line px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-kumo-danger/20">
            <Trash2 size={18} className="text-kumo-danger" />
          </div>
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
        </div>
        <div className="flex flex-col gap-4 p-6">
          <Dialog.Description className="text-base leading-6 text-kumo-subtle">
            {description}
          </Dialog.Description>
        </div>
        <div className="flex justify-end gap-3 border-t border-kumo-line px-6 py-4">
          <Dialog.Close render={(props) => <Button variant="secondary" {...props}>Batal</Button>} />
          <Button
            variant="destructive"
            icon={<Trash2 size={16} />}
            className="inline-flex items-center gap-2"
            loading={isDeleting}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
