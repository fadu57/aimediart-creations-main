import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Percent } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  commercialKindLabel,
  commercialPlanLabel,
  hasGrantedCommercialTerms,
  type CommercialKind,
  type CommercialPlanCode,
} from "@/lib/organisation/commercialTerms";
import { supabase } from "@/lib/supabase";

type GrantedCommercialAgency = {
  id: string;
  name_agency: string | null;
  commercial_kind: string | null;
  commercial_plan_code: string | null;
  discount_percent: number | null;
  discount_amount_eur: number | null;
};

function formatAnnualDiscount(row: GrantedCommercialAgency): string {
  const eur = Number(row.discount_amount_eur) || 0;
  if (eur <= 0) return "—";
  const annual = Math.round(eur * 12 * 100) / 100;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(annual);
}

export function DashboardGrantedCommercialTermsCard() {
  const [rows, setRows] = useState<GrantedCommercialAgency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const { data, error: qErr } = await supabase
        .from("agencies")
        .select("id, name_agency, commercial_kind, commercial_plan_code, discount_percent, discount_amount_eur")
        .is("deleted_at", null)
        .order("name_agency", { ascending: true, nullsFirst: false });

      if (cancelled) return;
      if (qErr) {
        setError(qErr.message);
        setRows([]);
        setLoading(false);
        return;
      }

      setRows(
        ((data ?? []) as GrantedCommercialAgency[]).filter((row) => hasGrantedCommercialTerms(row)),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl flex items-center gap-2">
          <Percent className="h-5 w-5 text-gold" />
          Conditions commerciales accordées
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement des organisations…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-4">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Aucune organisation avec des conditions commerciales enregistrées pour le moment.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[#9d2525]/20">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#fff9f7]/80 hover:bg-[#fff9f7]/80 dark:bg-[#fff9f7]/10">
                  <TableHead className="h-8 min-w-[180px] max-w-[240px] px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#9d2525]">
                    Organisation
                  </TableHead>
                  <TableHead className="h-8 min-w-[72px] px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#9d2525]">
                    Plan
                  </TableHead>
                  <TableHead className="h-8 min-w-[120px] px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#9d2525]">
                    Profil
                  </TableHead>
                  <TableHead className="h-8 min-w-[100px] px-2 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-[#9d2525]">
                    Remise annuelle TTC
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const label = row.name_agency?.trim() || "Sans nom";
                  const planLabel = commercialPlanLabel(row.commercial_plan_code as CommercialPlanCode | null);
                  const kindLabel = commercialKindLabel(row.commercial_kind as CommercialKind | null);
                  return (
                    <TableRow key={row.id} className="hover:bg-muted/30">
                      <TableCell className="min-w-[180px] max-w-[240px] px-2 py-1.5 align-top text-xs font-medium">
                        <Link
                          to={`/agencies?agency=${encodeURIComponent(row.id)}`}
                          className="block whitespace-normal text-primary leading-snug hover:underline line-clamp-2"
                          title={label}
                        >
                          {label}
                        </Link>
                      </TableCell>
                      <TableCell className="px-2 py-1.5">
                        {planLabel ? (
                          <span className="inline-flex rounded-full border border-[#9d2525]/30 px-2 py-0.5 text-[10px] font-medium leading-none text-[#9d2525]">
                            {planLabel}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-[11px] font-medium leading-tight text-[#9d2525]">
                        {kindLabel ?? "—"}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-right text-xs font-semibold tabular-nums text-[#9d2525]">
                        {formatAnnualDiscount(row)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
