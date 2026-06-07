import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Text } from "@cloudflare/kumo/components/text";
import { cn } from "@cloudflare/kumo/utils";
import { LucideIcon } from "lucide-react";

type Props = {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "green" | "blue" | "amber" | "red";
};

export function StatCard({ label, value, icon: Icon, tone = "green" }: Props) {
  const toneClass = {
    green: "bg-kumo-success-tint text-kumo-success",
    blue: "bg-kumo-info-tint text-kumo-info",
    amber: "bg-kumo-warning-tint text-kumo-warning",
    red: "bg-kumo-danger-tint text-kumo-danger",
  }[tone];

  return (
    <LayerCard className="grid min-h-32 gap-2 p-4">
      <div className={cn("grid h-10 w-10 place-items-center rounded-full", toneClass)}><Icon size={20} /></div>
      <Text as="span" variant="secondary" size="sm">{label}</Text>
      <Text as="strong" variant="body" bold DANGEROUS_className="text-2xl leading-none">{value}</Text>
    </LayerCard>
  );
}
