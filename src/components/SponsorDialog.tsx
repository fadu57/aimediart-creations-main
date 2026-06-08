import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";

type Sponsor = {
  id: string;
  id_expo: string;
  nom_expo: string | null;
  nom_sponsor: string;
  contact_sponsor: string | null;
  mail_sponsor: string | null;
  tel_sponsor: string | null;
  adresse_sponsor: string | null;
  zipcode_sponsor: string | null;
  city_sponsor: string | null;
  url_logo_sponsor: string | null;
  descrip_sponsor: string | null;
  amount: number | null;
  currency: string;
};

export type { Sponsor };

// ─── Types (form) ─────────────────────────────────────────────────────────────

type FormValues = {
  nom_sponsor: string;
  contact_sponsor: string;
  mail_sponsor: string;
  tel_sponsor: string;
  adresse_sponsor: string;
  zipcode_sponsor: string;
  city_sponsor: string;
  url_logo_sponsor: string;
  descrip_sponsor: string;
  amount: string;
  currency: string;
};

const EMPTY_FORM: FormValues = {
  nom_sponsor: "",
  contact_sponsor: "",
  mail_sponsor: "",
  tel_sponsor: "",
  adresse_sponsor: "",
  zipcode_sponsor: "",
  city_sponsor: "",
  url_logo_sponsor: "",
  descrip_sponsor: "",
  amount: "",
  currency: "EUR",
};

const CURRENCIES = ["EUR", "USD", "GBP", "CHF"] as const;

export type SponsorLogoEntry = { id: string; url: string; nom: string };

export function sponsorsToLogoEntries(
  sponsors: Array<{ id: string; nom_sponsor: string; url_logo_sponsor: string | null }>,
): SponsorLogoEntry[] {
  return sponsors
    .filter((s) => s.url_logo_sponsor?.trim())
    .map((s) => ({
      id: s.id,
      url: s.url_logo_sponsor!.trim(),
      nom: s.nom_sponsor ?? "",
    }));
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type SponsorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = mode global (tous les expos) */
  expoId?: string | null;
  expoName?: string;
  /** Si fourni, ouvre directement la fiche de ce sponsor */
  initialSponsorId?: string | null;
  /** Ouvre directement le formulaire d'ajout (nécessite expoId) */
  openInForm?: boolean;
  /** Appelé après création, modification ou suppression (logos + liste complète) */
  onSponsorsChange?: (logos: SponsorLogoEntry[], scopeExpoId: string | null, sponsors: Sponsor[]) => void;
};

// ─── Upload logo ─────────────────────────────────────────────────────────────

function bustLogoUrl(url: string): string {
  const base = url.split("?")[0];
  return `${base}?v=${Date.now()}`;
}

async function uploadSponsorLogo(file: File, sponsorId: string): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "webp";
  const path = `${sponsorId}.${ext}`;
  const { error } = await supabase.storage
    .from("sponsors")
    .upload(path, file, { upsert: true, cacheControl: "60" });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("sponsors").getPublicUrl(path);
  return bustLogoUrl(data.publicUrl);
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function SponsorDialog({
  open,
  onOpenChange,
  expoId = null,
  expoName = "",
  initialSponsorId = null,
  openInForm = false,
  onSponsorsChange,
}: SponsorDialogProps) {
  const { t } = useTranslation("sponsors");
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  /** Sponsor en attente de confirmation de suppression (liste ou formulaire) */
  const [pendingDelete, setPendingDelete] = useState<{ id: string; nom: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handledInitialRef = useRef<string | null>(null);
  const onSponsorsChangeRef = useRef(onSponsorsChange);
  const sponsorsRef = useRef(sponsors);

  useEffect(() => {
    onSponsorsChangeRef.current = onSponsorsChange;
  }, [onSponsorsChange]);

  useEffect(() => {
    sponsorsRef.current = sponsors;
  }, [sponsors]);

  // ── Chargement ─────────────────────────────────────────────
  const load = useCallback(async (): Promise<Sponsor[]> => {
    setLoading(true);
    try {
      let q = supabase.from("sponsors").select("*").order("created_at", { ascending: true });
      if (expoId) q = q.eq("id_expo", expoId);
      const { data, error } = await q;
      if (error) throw error;
      const list = (data as Sponsor[]) ?? [];
      setSponsors(list);
      return list;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.loadFailed"));
      return [];
    } finally {
      setLoading(false);
    }
  }, [expoId, t]);

  const notifySponsorsChange = useCallback(
    (list: Sponsor[]) => {
      onSponsorsChangeRef.current?.(sponsorsToLogoEntries(list), expoId ?? null, list);
    },
    [expoId],
  );

  const applySponsorsList = useCallback(
    (list: Sponsor[]) => {
      sponsorsRef.current = list;
      setSponsors(list);
      notifySponsorsChange(list);
    },
    [notifySponsorsChange],
  );

  useEffect(() => {
    if (!open) {
      handledInitialRef.current = null;
      setLogoPreview((prev) => {
        if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
        return "";
      });
      setLogoFile(null);
      return;
    }
    void load();
    if (initialSponsorId) return;
    if (openInForm && expoId) {
      setEditingId(null);
      setForm(EMPTY_FORM);
      setLogoFile(null);
      setLogoPreview("");
      setView("form");
      return;
    }
    setView("list");
  }, [open, load, openInForm, expoId, initialSponsorId]);

  // Ouvre directement la fiche sponsor quand initialSponsorId est fourni et les données chargées
  useEffect(() => {
    if (!open || !initialSponsorId || sponsors.length === 0) return;
    if (handledInitialRef.current === initialSponsorId) return;
    const target = sponsors.find((s) => s.id === initialSponsorId);
    if (target) {
      handledInitialRef.current = initialSponsorId;
      openEdit(target);
    }
  // openEdit est stable dans ce scope — on supprime le warning exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSponsorId, sponsors]);

  // ── Helpers formulaire ─────────────────────────────────────
  const set = (key: keyof FormValues, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setLogoFile(null);
    setLogoPreview("");
    setView("form");
  };

  const openEdit = (s: Sponsor) => {
    setEditingId(s.id);
    setForm({
      nom_sponsor: s.nom_sponsor,
      contact_sponsor: s.contact_sponsor ?? "",
      mail_sponsor: s.mail_sponsor ?? "",
      tel_sponsor: s.tel_sponsor ?? "",
      adresse_sponsor: s.adresse_sponsor ?? "",
      zipcode_sponsor: s.zipcode_sponsor ?? "",
      city_sponsor: s.city_sponsor ?? "",
      url_logo_sponsor: s.url_logo_sponsor ?? "",
      descrip_sponsor: s.descrip_sponsor ?? "",
      amount: s.amount != null ? String(s.amount) : "",
      currency: s.currency ?? "EUR",
    });
    setLogoFile(null);
    setLogoPreview(s.url_logo_sponsor ?? "");
    setView("form");
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLogoFile(file);
    setLogoPreview((prev) => {
      if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  // ── Sauvegarde ─────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.nom_sponsor.trim()) {
      toast.error(t("errors.nameRequired"));
      return;
    }
    const parsedAmount = form.amount.trim() ? parseFloat(form.amount) : null;
    if (form.amount.trim() && (isNaN(parsedAmount!) || parsedAmount! < 0)) {
      toast.error(t("errors.amountInvalid"));
      return;
    }
    setSaving(true);
    try {
      let logoUrl = form.url_logo_sponsor?.trim() || null;
      const payload = {
        nom_sponsor: form.nom_sponsor.trim(),
        contact_sponsor: form.contact_sponsor.trim() || null,
        mail_sponsor: form.mail_sponsor.trim() || null,
        tel_sponsor: form.tel_sponsor.trim() || null,
        adresse_sponsor: form.adresse_sponsor.trim() || null,
        zipcode_sponsor: form.zipcode_sponsor.trim() || null,
        city_sponsor: form.city_sponsor.trim() || null,
        descrip_sponsor: form.descrip_sponsor.trim() || null,
        amount: parsedAmount,
        currency: form.currency,
      };

      if (editingId) {
        if (logoFile) logoUrl = await uploadSponsorLogo(logoFile, editingId);
        const { error } = await supabase
          .from("sponsors")
          .update({ ...payload, url_logo_sponsor: logoUrl })
          .eq("id", editingId);
        if (error) throw error;
        toast.success(t("toast.updated"));
        const merged = sponsorsRef.current.map((s) =>
          s.id === editingId
            ? { ...s, ...payload, url_logo_sponsor: logoUrl }
            : s,
        );
        applySponsorsList(merged);
      } else {
        const newId = crypto.randomUUID();
        if (logoFile) logoUrl = await uploadSponsorLogo(logoFile, newId);
        const { error } = await supabase.from("sponsors").insert({
          id: newId,
          id_expo: expoId,
          nom_expo: expoName || null,
          ...payload,
          url_logo_sponsor: logoUrl,
        });
        if (error) throw error;
        toast.success(t("toast.added"));
        const created: Sponsor = {
          id: newId,
          id_expo: expoId ?? "",
          nom_expo: expoName || null,
          nom_sponsor: payload.nom_sponsor,
          contact_sponsor: payload.contact_sponsor,
          mail_sponsor: payload.mail_sponsor,
          tel_sponsor: payload.tel_sponsor,
          adresse_sponsor: payload.adresse_sponsor,
          zipcode_sponsor: payload.zipcode_sponsor,
          city_sponsor: payload.city_sponsor,
          url_logo_sponsor: logoUrl,
          descrip_sponsor: payload.descrip_sponsor,
          amount: payload.amount,
          currency: payload.currency,
        };
        applySponsorsList([...sponsorsRef.current, created]);
      }
      setLogoFile(null);
      setView("list");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[SponsorDialog] save error:", e);
      toast.error(msg || t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  // ── Suppression ────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const { error } = await supabase.from("sponsors").delete().eq("id", id);
      if (error) throw error;
      toast.success(t("toast.deleted"));
      applySponsorsList(sponsorsRef.current.filter((s) => s.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.deleteFailed"));
    } finally {
      setDeleting(null);
    }
  };

  // ── Titre ──────────────────────────────────────────────────
  const dialogTitle =
    view === "list"
      ? expoId
        ? t("title.listExpo", { name: expoName })
        : t("title.listAll")
      : editingId
        ? t("title.edit")
        : t("title.new");

  // ── Rendu ──────────────────────────────────────────────────
  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="!w-auto min-w-[420px] max-w-[90vw]">
        <DialogTitle className="text-base font-semibold leading-tight">
          {dialogTitle}
        </DialogTitle>

        {/* Zone scrollable : max 65vh pour tenir dans l'écran */}
        <div className="overflow-y-auto" style={{ maxHeight: "65vh" }}>

          {/* ── Vue liste ── */}
          {view === "list" && (
            <div className="space-y-3">
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : sponsors.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {expoId ? t("list.emptyExpo") : t("list.empty")}
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {sponsors.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                      {s.url_logo_sponsor ? (
                        <img
                          key={`${s.id}-${s.url_logo_sponsor}`}
                          src={s.url_logo_sponsor}
                          alt={s.nom_sponsor}
                          className="h-10 w-16 shrink-0 object-contain"
                        />
                      ) : (
                        <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded border border-dashed border-border bg-muted/30">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{s.nom_sponsor}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[
                            s.city_sponsor,
                            s.amount != null
                              ? `${Number(s.amount).toLocaleString("fr-FR")} ${s.currency}`
                              : null,
                            !expoId && s.nom_expo ? s.nom_expo : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title={t("list.editTitle")}
                          onClick={() => openEdit(s)}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          disabled={deleting === s.id}
                          title={t("form.delete")}
                          onClick={() => setPendingDelete({ id: s.id, nom: s.nom_sponsor })}
                        >
                          {deleting === s.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {expoId && (
                <Button
                  type="button"
                  className="w-full gradient-gold gradient-gold-hover-bg text-primary-foreground"
                  onClick={openNew}
                >
                  <Plus className="mr-2 h-4 w-4" aria-hidden />
                  {t("list.addBtn")}
                </Button>
              )}
            </div>
          )}

          {/* ── Vue formulaire ── */}
          {view === "form" && (
            <div className="space-y-3">
              {/* Logo */}
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted/30">
                  {logoPreview ? (
                    <img key={logoPreview} src={logoPreview} alt="Logo" className="h-full w-full object-contain" />
                  ) : (
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-2 h-3.5 w-3.5" aria-hidden />
                    {logoPreview ? t("form.changeLogo") : t("form.uploadLogo")}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={handleLogoChange}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{t("form.logoHint")}</p>
                </div>
              </div>

              {/* Nom */}
              <div className="space-y-1">
                <Label className="text-xs">
                  {t("form.nameLabel")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.nom_sponsor}
                  onChange={(e) => set("nom_sponsor", e.target.value)}
                  placeholder={t("form.namePlaceholder")}
                />
              </div>

              {/* Contact + Tel */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t("form.contactLabel")}</Label>
                  <Input
                    value={form.contact_sponsor}
                    onChange={(e) => set("contact_sponsor", e.target.value)}
                    placeholder={t("form.contactPlaceholder")}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("form.phoneLabel")}</Label>
                  <Input
                    value={form.tel_sponsor}
                    onChange={(e) => set("tel_sponsor", e.target.value)}
                    placeholder="+33 6 …"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1">
                <Label className="text-xs">{t("form.emailLabel")}</Label>
                <Input
                  type="email"
                  value={form.mail_sponsor}
                  onChange={(e) => set("mail_sponsor", e.target.value)}
                  placeholder="contact@sponsor.fr"
                />
              </div>

              {/* Adresse */}
              <div className="space-y-1">
                <Label className="text-xs">{t("form.addressLabel")}</Label>
                <Input
                  value={form.adresse_sponsor}
                  onChange={(e) => set("adresse_sponsor", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t("form.zipLabel")}</Label>
                  <Input
                    value={form.zipcode_sponsor}
                    onChange={(e) => set("zipcode_sponsor", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("form.cityLabel")}</Label>
                  <Input
                    value={form.city_sponsor}
                    onChange={(e) => set("city_sponsor", e.target.value)}
                  />
                </div>
              </div>

              {/* Montant + Devise */}
              <div className="grid grid-cols-[1fr_120px] gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t("form.amountLabel")}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="text-right"
                    value={form.amount}
                    onChange={(e) => set("amount", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("form.currencyLabel")}</Label>
                  <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <Label className="text-xs">{t("form.descLabel")}</Label>
                <Textarea
                  rows={3}
                  value={form.descrip_sponsor}
                  onChange={(e) => set("descrip_sponsor", e.target.value)}
                  className="resize-none"
                  placeholder={t("form.descPlaceholder")}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={saving}
                  onClick={() => setView("list")}
                >
                  ← {t("form.cancel")}
                </Button>
                {editingId && (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={saving || deleting === editingId}
                    onClick={() => setPendingDelete({ id: editingId!, nom: form.nom_sponsor })}
                  >
                    {deleting === editingId
                      ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      : <Trash2 className="h-4 w-4" aria-hidden />}
                    {t("form.delete")}
                  </Button>
                )}
                <Button
                  type="button"
                  className="flex-1 gradient-gold gradient-gold-hover-bg text-primary-foreground"
                  disabled={saving}
                  onClick={() => void handleSave()}
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                  {editingId ? t("form.save") : t("form.add")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!pendingDelete} onOpenChange={(v) => { if (!v) setPendingDelete(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteConfirm.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteConfirm.description", { name: pendingDelete?.nom ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={!!deleting}>
            {t("deleteConfirm.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={!!deleting}
            onClick={() => {
              if (!pendingDelete) return;
              const { id } = pendingDelete;
              setPendingDelete(null);
              void handleDelete(id).then(() => {
                if (view === "form") setView("list");
              });
            }}
          >
            {!!deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {t("deleteConfirm.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
