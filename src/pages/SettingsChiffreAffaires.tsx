/**
 * Settings — Chiffre d'affaires
 * Compile les CA réalisés (saisie manuelle), miroir UX de /settings/couts.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Download,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  REVENUE_CATEGORIES,
  REVENUE_STATUSES,
  computeRevenueKpis,
  createRevenueEntry,
  deleteRevenueEntry,
  exportRevenueCsv,
  getRevenueDocumentSignedUrl,
  listRevenueEntries,
  updateRevenueEntry,
  uploadRevenueDocument,
  type RevenueDocument,
  type RevenueEntry,
  type RevenueEntryInput,
  type RevenueStatus,
} from "@/lib/revenueEntries";

const PIE_COLORS = ["#0f766e", "#0369a1", "#b45309", "#7c3aed", "#be123c", "#4b5563"];

function formatEur(n: number, currency = "EUR") {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="glass-card border-border/60">
      <CardContent className="flex flex-col gap-1 p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-serif font-bold tracking-tight">{value}</p>
        {hint ? <p className="text-[11px] text-muted-foreground/90">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

type FormState = {
  entryDate: string;
  label: string;
  category: string;
  clientName: string;
  amountTtc: string;
  currency: string;
  vatRate: string;
  invoiceRef: string;
  status: RevenueStatus;
  note: string;
  documents: RevenueDocument[];
};

const emptyForm = (): FormState => ({
  entryDate: new Date().toISOString().slice(0, 10),
  label: "",
  category: "abonnement",
  clientName: "",
  amountTtc: "",
  currency: "EUR",
  vatRate: "20",
  invoiceRef: "",
  status: "paid",
  note: "",
  documents: [],
});

const SettingsChiffreAffaires = () => {
  const { t } = useTranslation("settings");
  const { user, global_role_id, loading: authLoading } = useAuthUser();
  const canEdit = typeof global_role_id === "number" && global_role_id >= 1 && global_role_id <= 2;

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<RevenueEntry[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RevenueEntry | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listRevenueEntries({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      category: category || undefined,
      status: status || undefined,
      q: q || undefined,
    });
    if (error) toast.error(error);
    setEntries(data);
    setLoading(false);
  }, [dateFrom, dateTo, category, status, q]);

  useEffect(() => {
    if (authLoading) return;
    void reload();
  }, [authLoading, reload]);

  const kpis = useMemo(() => computeRevenueKpis(entries), [entries]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setPendingFiles([]);
    setDialogOpen(true);
  };

  const openEdit = (row: RevenueEntry) => {
    setEditing(row);
    setForm({
      entryDate: row.entry_date,
      label: row.label,
      category: row.category,
      clientName: row.client_name ?? "",
      amountTtc: String(row.amount_ttc),
      currency: row.currency,
      vatRate: String(row.vat_rate),
      invoiceRef: row.invoice_ref ?? "",
      status: row.status,
      note: row.note ?? "",
      documents: row.documents ?? [],
    });
    setPendingFiles([]);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!canEdit) return;
    const amount = Number(String(form.amountTtc).replace(",", "."));
    if (!form.label.trim()) {
      toast.error(t("ca.error_required"));
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error(t("ca.error_amount"));
      return;
    }
    setSaving(true);
    const input: RevenueEntryInput = {
      entryDate: form.entryDate,
      label: form.label,
      category: form.category,
      clientName: form.clientName,
      amountTtc: amount,
      currency: form.currency,
      vatRate: Number(String(form.vatRate).replace(",", ".")) || 0,
      invoiceRef: form.invoiceRef,
      status: form.status,
      note: form.note,
      documents: form.documents,
    };

    let entryId = editing?.id ?? null;
    if (editing) {
      const { error } = await updateRevenueEntry(editing.id, input, user?.id ?? null);
      if (error) {
        toast.error(error);
        setSaving(false);
        return;
      }
    } else {
      const { id, error } = await createRevenueEntry(input, user?.id ?? null);
      if (error || !id) {
        toast.error(error ?? t("ca.error_save"));
        setSaving(false);
        return;
      }
      entryId = id;
    }

    if (entryId && pendingFiles.length) {
      const docs = [...(input.documents ?? [])];
      for (const file of pendingFiles) {
        const { doc, error } = await uploadRevenueDocument(file, entryId);
        if (error) toast.error(t("ca.error_upload", { detail: error }));
        else if (doc) docs.push(doc);
      }
      await updateRevenueEntry(entryId, { ...input, documents: docs }, user?.id ?? null);
    }

    toast.success(editing ? t("ca.updated") : t("ca.saved"));
    setSaving(false);
    setDialogOpen(false);
    void reload();
  };

  const remove = async (row: RevenueEntry) => {
    if (!canEdit) return;
    if (!window.confirm(t("ca.confirm_delete"))) return;
    const { error } = await deleteRevenueEntry(row.id);
    if (error) toast.error(error);
    else {
      toast.success(t("ca.deleted"));
      void reload();
    }
  };

  const downloadCsv = () => {
    const csv = exportRevenueCsv(entries);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chiffre-affaires-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openDoc = async (doc: RevenueDocument) => {
    const { url, error } = await getRevenueDocumentSignedUrl(doc.path);
    if (error || !url) toast.error(error ?? t("ca.error_doc"));
    else window.open(url, "_blank", "noopener,noreferrer");
  };

  const catLabel = (c: string) => t(`ca.category_${c}`, { defaultValue: c });
  const statusLabel = (s: string) => t(`ca.status_${s}`, { defaultValue: s });

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 pb-16">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label={t("ca.kpi_total")} value={formatEur(kpis.total)} />
        <KpiCard label={t("ca.kpi_paid")} value={formatEur(kpis.paidTotal)} />
        <KpiCard
          label={t("ca.kpi_count")}
          value={String(kpis.count)}
          hint={t("ca.kpi_avg", { amount: formatEur(kpis.avg) })}
        />
        <KpiCard
          label={t("ca.kpi_top_category")}
          value={kpis.topCategory === "—" ? "—" : catLabel(kpis.topCategory)}
          hint={kpis.topAmount ? formatEur(kpis.topAmount) : undefined}
        />
      </div>

      <div>
        <div className="mb-1 flex items-center gap-2">
          <Link
            to="/settings"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden />
            {t("ca.back_settings")}
          </Link>
        </div>
        <h1 className="flex items-center gap-2 text-2xl font-serif font-bold tracking-tight">
          <TrendingUp className="h-6 w-6 text-teal-700" aria-hidden />
          {t("ca.page_title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("ca.page_sub")}</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t("ca.filter_date_from")}</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t("ca.filter_date_to")}</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t("ca.filter_category")}</Label>
            <Select value={category || "__all"} onValueChange={(v) => setCategory(v === "__all" ? "" : v)}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder={t("ca.filter_all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{t("ca.filter_all")}</SelectItem>
                {REVENUE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {catLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t("ca.filter_status")}</Label>
            <Select value={status || "__all"} onValueChange={(v) => setStatus(v === "__all" ? "" : v)}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder={t("ca.filter_all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{t("ca.filter_all")}</SelectItem>
                {REVENUE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-[180px] flex-1 flex-col gap-1">
            <Label className="text-xs">{t("ca.filter_search")}</Label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("ca.filter_search_ph")}
              className="h-9"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
            {t("ca.filter_apply")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setCategory("");
              setStatus("");
              setQ("");
            }}
          >
            {t("ca.filter_reset")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-3">
          <CardTitle className="text-base font-semibold">{t("ca.table_title")}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={downloadCsv}>
              <Download className="h-3.5 w-3.5" aria-hidden />
              {t("ca.export_csv")}
            </Button>
            {canEdit ? (
              <Button type="button" size="sm" className="gap-1.5" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {t("ca.add")}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("ca.loading")}
            </div>
          ) : entries.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-muted-foreground">{t("ca.empty")}</p>
          ) : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t("ca.col_date")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("ca.col_label")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("ca.col_client")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("ca.col_category")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("ca.col_status")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("ca.col_amount")}</th>
                  {canEdit ? <th className="px-4 py-2.5 text-right font-medium">{t("ca.col_actions")}</th> : null}
                </tr>
              </thead>
              <tbody>
                {entries.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="whitespace-nowrap px-4 py-2.5">{row.entry_date}</td>
                    <td className="max-w-[220px] px-4 py-2.5">
                      <p className="truncate font-medium">{row.label}</p>
                      {row.invoice_ref ? (
                        <p className="truncate text-xs text-muted-foreground">{row.invoice_ref}</p>
                      ) : null}
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-2.5">{row.client_name || "—"}</td>
                    <td className="px-4 py-2.5">{catLabel(row.category)}</td>
                    <td className="px-4 py-2.5">{statusLabel(row.status)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums">
                      {formatEur(row.amount_ttc, row.currency)}
                    </td>
                    {canEdit ? (
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => void remove(row)}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t("ca.chart_timeline")}</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]">
            {kpis.timeline.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">{t("ca.chart_empty")}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kpis.timeline}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatEur(v)} />
                  <Bar dataKey="amount" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t("ca.chart_categories")}</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]">
            {kpis.categoryPie.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">{t("ca.chart_empty")}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={kpis.categoryPie.map((c) => ({
                      ...c,
                      name: catLabel(c.category),
                    }))}
                    dataKey="amount"
                    nameKey="name"
                    outerRadius={90}
                    label={({ name }) => name}
                  >
                    {kpis.categoryPie.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatEur(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t("ca.dialog_edit") : t("ca.dialog_add")}</DialogTitle>
            <DialogDescription>{t("ca.dialog_desc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t("ca.field_date")}</Label>
                <Input
                  type="date"
                  value={form.entryDate}
                  onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t("ca.field_status")}</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as RevenueStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REVENUE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {statusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t("ca.field_label")}</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder={t("ca.field_label_ph")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t("ca.field_category")}</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REVENUE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {catLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t("ca.field_client")}</Label>
                <Input
                  value={form.clientName}
                  onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                  placeholder={t("ca.field_client_ph")}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t("ca.field_amount")}</Label>
                <Input
                  value={form.amountTtc}
                  onChange={(e) => setForm((f) => ({ ...f, amountTtc: e.target.value }))}
                  inputMode="decimal"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t("ca.field_vat")}</Label>
                <Input
                  value={form.vatRate}
                  onChange={(e) => setForm((f) => ({ ...f, vatRate: e.target.value }))}
                  inputMode="decimal"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t("ca.field_currency")}</Label>
                <Input
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t("ca.field_invoice")}</Label>
              <Input
                value={form.invoiceRef}
                onChange={(e) => setForm((f) => ({ ...f, invoiceRef: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t("ca.field_note")}</Label>
              <Textarea
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t("ca.field_documents")}</Label>
              {form.documents.length > 0 ? (
                <ul className="mb-1 space-y-1 text-xs">
                  {form.documents.map((d) => (
                    <li key={d.path}>
                      <button type="button" className="text-teal-700 underline" onClick={() => void openDoc(d)}>
                        {d.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Input
                type="file"
                multiple
                accept=".pdf,image/*,.doc,.docx"
                onChange={(e) => setPendingFiles(Array.from(e.target.files ?? []))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {t("ca.cancel")}
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {t("ca.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsChiffreAffaires;
