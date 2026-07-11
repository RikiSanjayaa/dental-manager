import { useQuery } from "@tanstack/react-query";

import { api } from "./api";

/** Default used when the report identity has not been configured in Settings. */
export const DEFAULT_BRAND_NAME = "Dental Manager";

type ReportIdentity = { clinic_name: string };

/** Derive a short brand name from the full name: the first one or two words. */
export function toShortName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return DEFAULT_BRAND_NAME;
  return words.slice(0, 2).join(" ");
}

/**
 * Brand identity for the web app, sourced from the "Identitas Laporan" setting
 * (`clinic_name`). Falls back to the default when unset. The short name is
 * derived from the first one or two words of the full name.
 */
export function useBrand(): { brandName: string; brandShortName: string } {
  const { data } = useQuery({
    queryKey: ["report-identity"],
    queryFn: () => api<ReportIdentity>("/settings/report-identity"),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const brandName = data?.clinic_name?.trim() || DEFAULT_BRAND_NAME;
  return { brandName, brandShortName: toShortName(brandName) };
}
