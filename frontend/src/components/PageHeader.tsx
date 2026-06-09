import { ReactNode } from "react";

import { PageHeader as KumoPageHeader } from "./kumo/page-header/page-header";

type Props = {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, eyebrow, actions }: Props) {
  return (
    <KumoPageHeader
      className="w-full"
      title={title}
      description={eyebrow}
    >
      {actions ? <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </KumoPageHeader>
  );
}
