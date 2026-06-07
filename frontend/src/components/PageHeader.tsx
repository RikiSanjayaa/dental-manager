import { ReactNode } from "react";
import { Breadcrumbs } from "@cloudflare/kumo/components/breadcrumbs";

import { brandName } from "../lib/brand";
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
      breadcrumbs={
        <Breadcrumbs size="sm">
          <Breadcrumbs.Link href="/">{brandName}</Breadcrumbs.Link>
          <Breadcrumbs.Separator />
          <Breadcrumbs.Current>{title}</Breadcrumbs.Current>
        </Breadcrumbs>
      }
      title={title}
      description={eyebrow}
    >
      {actions ? <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </KumoPageHeader>
  );
}
