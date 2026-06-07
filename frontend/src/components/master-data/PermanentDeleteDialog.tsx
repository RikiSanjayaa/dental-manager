import { Button } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Trash2 } from "lucide-react";

import { MASTER_META } from "./constants";
import type { PermanentDeleteSession } from "./types";

type Props = {
  session: PermanentDeleteSession;
  isDeleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function PermanentDeleteDialog({
  session,
  isDeleting,
  onOpenChange,
  onConfirm,
}: Props) {
  return (
    <Dialog.Root
      disablePointerDismissal
      open={session.open}
      onOpenChange={(open) => onOpenChange(open)}
    >
      <Dialog className="p-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-kumo-danger/20">
            <Trash2 size={20} className="text-kumo-danger" />
          </div>
          <Dialog.Title className="text-xl font-semibold">
            Hapus permanen {MASTER_META[session.target].label}?
          </Dialog.Title>
        </div>
        <Dialog.Description className="text-kumo-subtle">
          {session.name
            ? `${session.name} akan dihapus permanen.`
            : "Data ini akan dihapus permanen."}{" "}
          Jika data sudah dipakai transaksi, sistem akan menolak penghapusan.
        </Dialog.Description>
        <div className="mt-8 flex justify-end gap-2">
          <Dialog.Close
            render={(props) => (
              <Button variant="secondary" {...props}>
                Batal
              </Button>
            )}
          />
          <Button
            variant="destructive"
            icon={<Trash2 size={16} />}
            loading={isDeleting}
            disabled={!session.id && !session.ids?.length}
            onClick={onConfirm}
          >
            Hapus permanen
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
