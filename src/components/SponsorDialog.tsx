import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Props ────────────────────────────────────────────────────────────────────

export type SponsorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = mode global (tous les expos) */
  expoId?: string | null;
  expoName?: string;
};

// ─── Upload logo ─────────────────────────────────────────────────────────────

async function uploadSponsorLogo(file: File, sponsorId: string): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "webp";
  const path = `${sponsorId}.${ext}`;
  const { error } = await supabase.storage
    .from("sponsors")
    .upload(path, file, { upsert: true, cacheControl: "3600" });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("sponsors").getPublicUrl(path);
  return data.publicUrl;
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function SponsorDialog({
  open,
  onOpenChange,
  expoId = null,
  expoName = "",
}: SponsorDialogProps) {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Chargement ─────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from("sponsors").select("*").order("created_at", { ascending: true });
      if (expoId) q = q.eq("id_expo", expoId);
      const { data, error } = await q;
      if (error) throw error;
      setSponsors((data as Sponsor[]) ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de charger les sponsors.");
    } finally {
      setLoading(false);
    }
  }, [expoId]);

  useEffect(() => {
    if (!open) return;
    setView("list");
    void load();
  }, [open, load]);

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
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  // ── Sauvegarde ─────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.nom_sponsor.trim()) {
      toast.error("Le nom du sponsor est obligatoire.");
      return;
    }
    const parsedAmount = form.amount.trim() ? parseFloat(form.amount) : null;
    if (form.amount.trim() && (isNaN(parsedAmount!) || parsedAmount! < 0)) {
      toast.error("Le montant doit être un nombre positif.");
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
        toast.success("Sponsor mis à jour.");
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
        toast.success("Sponsor ajouté.");
      }
      await load();
      setView("list");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[SponsorDialog] save error:", e);
      toast.error(msg || "Erreur lors de l'enregistrement.");
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
      toast.success("Sponsor supprimé.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la suppression.");
    } finally {
      setDeleting(null);
    }
  };

  // ── Titre ──────────────────────────────────────────────────
  const dialogTitle =
    view === "list"
      ? expoId
        ? `Sponsors / Mécènes — ${expoName}`
        : "Sponsors / Mécènes — toutes les expositions"
      : editingId
        ? "Modifier le sponsor"
        : "Nouveau sponsor";

  // ── Rendu ──────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* On garde le DialogContent par défaut (p-6, max-w-lg) sans le surcharger */}
      <DialogContent aria-describedby={undefined} className="max-w-lg">
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
                  Aucun sponsor enregistré
                  {expoId ? " pour cette exposition" : ""}.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {sponsors.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                      {s.url_logo_sponsor ? (
                        <img
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
                          title="Modifier"
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
                          title="Supprimer"
                          onClick={() => void handleDelete(s.id)}
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
                  Ajouter un sponsor / mécène
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
                    <img src={logoPreview} alt="Logo" className="h-full w-full object-contain" />
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
                    {logoPreview ? "Changer le logo" : "Télécharger un logo"}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={handleLogoChange}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">PNG, JPG, WebP ou SVG · 2 Mo max</p>
                </div>
              </div>

              {/* Nom */}
              <div className="space-y-1">
                <Label className="text-xs">
                  Nom du sponsor <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.nom_sponsor}
                  onChange={(e) => set("nom_sponsor", e.target.value)}
                  placeholder="Nom de l'organisation…"
                />
              </div>

              {/* Contact + Tel */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Contact</Label>
                  <Input
                    value={form.contact_sponsor}
                    onChange={(e) => set("contact_sponsor", e.target.value)}
                    placeholder="Nom du contact"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Téléphone</Label>
                  <Input
                    value={form.tel_sponsor}
                    onChange={(e) => set("tel_sponsor", e.target.value)}
                    placeholder="+33 6 …"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={form.mail_sponsor}
                  onChange={(e) => set("mail_sponsor", e.target.value)}
                  placeholder="contact@sponsor.fr"
                />
              </div>

              {/* Adresse */}
              <div className="space-y-1">
                <Label className="text-xs">Adresse</Label>
                <Input
                  value={form.adresse_sponsor}
                  onChange={(e) => set("adresse_sponsor", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Code postal</Label>
                  <Input
                    value={form.zipcode_sponsor}
                    onChange={(e) => set("zipcode_sponsor", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ville</Label>
                  <Input
                    value={form.city_sponsor}
                    onChange={(e) => set("city_sponsor", e.target.value)}
                  />
                </div>
              </div>

              {/* Montant + Devise */}
              <div className="grid grid-cols-[1fr_120px] gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Montant du mécénat</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => set("amount", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Devise</Label>
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
                <Label className="text-xs">Description / présentation</Label>
                <Textarea
                  rows={3}
                  value={form.descrip_sponsor}
                  onChange={(e) => set("descrip_sponsor", e.target.value)}
                  className="resize-none"
                  placeholder="Présentation du sponsor, nature du soutien…"
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
                  ← Annuler
                </Button>
                <Button
                  type="button"
                  className="flex-1 gradient-gold gradient-gold-hover-bg text-primary-foreground"
                  disabled={saving}
                  onClick={() => void handleSave()}
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                  {editingId ? "Enregistrer" : "Ajouter"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
