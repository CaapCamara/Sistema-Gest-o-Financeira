import type { BadgeTone } from "@/components/ui/badge";

export function tomStatusProtocolo(pendente: boolean): BadgeTone {
  return pendente ? "amber" : "green";
}
