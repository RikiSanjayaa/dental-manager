import { Badge } from "@cloudflare/kumo/components/badge";

import { MASTER_META } from "./constants";
import type { MasterTarget } from "./types";

type Props = {
  activeTab: MasterTarget;
  counts: Record<MasterTarget, number>;
  onTabChange: (target: MasterTarget) => void;
};

export function MasterTabBar({ activeTab, counts, onTabChange }: Props) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {(Object.keys(MASTER_META) as MasterTarget[]).map((target) => (
        <button
          key={target}
          type="button"
          className={`rounded-lg border p-4 text-left transition hover:bg-kumo-tint ${
            activeTab === target
              ? "border-kumo-brand bg-kumo-brand/5"
              : "border-kumo-hairline bg-kumo-base"
          }`}
          onClick={() => onTabChange(target)}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-medium text-kumo-default">
              {MASTER_META[target].icon}
              {MASTER_META[target].label}
            </div>
            <Badge variant={activeTab === target ? "success" : "secondary"}>
              {counts[target]}
            </Badge>
          </div>
          <p className="mt-2 text-sm leading-5 text-kumo-subtle">
            {MASTER_META[target].description}
          </p>
        </button>
      ))}
    </div>
  );
}
