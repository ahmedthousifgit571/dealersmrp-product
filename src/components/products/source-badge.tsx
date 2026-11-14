import { FileScan, PencilLine, Sheet } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const SOURCES = {
  INVOICE_OCR: { label: "Invoice", icon: FileScan },
  EXCEL_BULK: { label: "Excel", icon: Sheet },
  MANUAL: { label: "Manual", icon: PencilLine },
} as const;

export type PriceSourceKey = keyof typeof SOURCES;

export function SourceBadge({ source }: { source: PriceSourceKey }) {
  const { label, icon: Icon } = SOURCES[source];
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <Icon data-icon="inline-start" />
      {label}
    </Badge>
  );
}

export const SOURCE_LABEL: Record<PriceSourceKey, string> = {
  INVOICE_OCR: "Invoice",
  EXCEL_BULK: "Excel",
  MANUAL: "Manual",
};
