import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

async function submitConnectedExpoQuote(
  values: ConnectedExpoQuoteFormValues,
  floorPlanFile: File | null,
): Promise<{ warn_floor_plan?: boolean }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase non configuré.");
  }

  const formData = new FormData();
  formData.append("org_name", values.org_name.trim());
  formData.append("contact_name", values.contact_name.trim());
  formData.append("contact_email", values.contact_email.trim());
  formData.append("contact_phone", values.contact_phone.trim());
  formData.append("need_description", values.need_description.trim());
  if (values.address.trim()) formData.append("address", values.address.trim());
  if (values.zip_code.trim()) formData.append("zip_code", values.zip_code.trim());
  if (values.city.trim()) formData.append("city", values.city.trim());
  if (floorPlanFile) formData.append("floor_plan", floorPlanFile);

  const res = await fetch(`${supabaseUrl}/functions/v1/connected-expo-quote`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: formData,
  });

  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    warn_floor_plan?: boolean;
  };
  if (!res.ok) {
    throw new Error(payload.error ?? `HTTP ${res.status}`);
  }
  return { warn_floor_plan: payload.warn_floor_plan };
}

export type ConnectedExpoQuoteFormValues = {
  org_name: string;
  contact_name: string;
  contact_email: string;
  address: string;
  zip_code: string;
  city: string;
  contact_phone: string;
  need_description: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultOrgName?: string;
};

const EMPTY: ConnectedExpoQuoteFormValues = {
  org_name: "",
  contact_name: "",
  contact_email: "",
  address: "",
  zip_code: "",
  city: "",
  contact_phone: "",
  need_description: "",
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function RequiredAsterisk() {
  return <span className="text-[#E63946]"> *</span>;
}

export function ConnectedExpoQuoteDialog({
  open,
  onOpenChange,
  defaultOrgName = "",
}: Props) {
  const { t } = useTranslation("home");
  const [values, setValues] = useState<ConnectedExpoQuoteFormValues>(EMPTY);
  const [floorPlanFile, setFloorPlanFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues((prev) => ({
      ...prev,
      org_name: defaultOrgName.trim() || prev.org_name,
    }));
  }, [open, defaultOrgName]);

  const setField = useCallback((key: keyof ConnectedExpoQuoteFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetForm = useCallback(() => {
    setValues({
      ...EMPTY,
      org_name: defaultOrgName.trim(),
    });
    setFloorPlanFile(null);
  }, [defaultOrgName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const org_name = values.org_name.trim();
    const contact_name = values.contact_name.trim();
    const contact_email = values.contact_email.trim();
    const contact_phone = values.contact_phone.trim();
    const need_description = values.need_description.trim();

    if (!org_name || !contact_name || !contact_email || !contact_phone || !need_description) {
      toast.error(t("connexion.form.error_required"));
      return;
    }
    if (!isValidEmail(contact_email)) {
      toast.error(t("connexion.form.error_email"));
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitConnectedExpoQuote(values, floorPlanFile);
      if (result.warn_floor_plan) {
        toast.warning(t("connexion.form.warn_floor_plan"));
      }

      onOpenChange(false);
      resetForm();
      setSuccessOpen(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/connected_expo_quote_requests/i.test(msg)) {
        toast.error(t("connexion.form.error_table"));
      } else {
        toast.error(t("connexion.form.error_submit", { message: msg }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("connexion.form.title")}</DialogTitle>
            <p className="text-xs font-normal italic text-[#E63946]">{t("connexion.form.required_hint")}</p>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ceq-org">
                {t("connexion.form.org_name")}
                <RequiredAsterisk />
              </Label>
              <Input
                id="ceq-org"
                value={values.org_name}
                onChange={(e) => setField("org_name", e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ceq-contact">
                {t("connexion.form.contact_name")}
                <RequiredAsterisk />
              </Label>
              <Input
                id="ceq-contact"
                value={values.contact_name}
                onChange={(e) => setField("contact_name", e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ceq-email">
                {t("connexion.form.contact_email")}
                <RequiredAsterisk />
              </Label>
              <Input
                id="ceq-email"
                type="email"
                value={values.contact_email}
                onChange={(e) => setField("contact_email", e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ceq-address">{t("connexion.form.address")}</Label>
              <Input
                id="ceq-address"
                value={values.address}
                onChange={(e) => setField("address", e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="flex min-w-[120px] flex-1 flex-col gap-1.5">
                <Label htmlFor="ceq-zip">{t("connexion.form.zip_code")}</Label>
                <Input
                  id="ceq-zip"
                  value={values.zip_code}
                  onChange={(e) => setField("zip_code", e.target.value)}
                />
              </div>
              <div className="flex min-w-[160px] flex-[2] flex-col gap-1.5">
                <Label htmlFor="ceq-city">{t("connexion.form.city")}</Label>
                <Input
                  id="ceq-city"
                  value={values.city}
                  onChange={(e) => setField("city", e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ceq-phone">
                {t("connexion.form.contact_phone")}
                <RequiredAsterisk />
              </Label>
              <Input
                id="ceq-phone"
                type="tel"
                value={values.contact_phone}
                onChange={(e) => setField("contact_phone", e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ceq-need">
                {t("connexion.form.need_description")}
                <RequiredAsterisk />
              </Label>
              <Textarea
                id="ceq-need"
                rows={4}
                value={values.need_description}
                onChange={(e) => setField("need_description", e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ceq-plan">{t("connexion.form.floor_plan")}</Label>
              <p className="text-xs text-muted-foreground">{t("connexion.form.floor_plan_accept")}</p>
              <Input
                id="ceq-plan"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf"
                onChange={(e) => setFloorPlanFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                {t("connexion.form.cancel")}
              </Button>
              <Button type="submit" disabled={submitting} className="gradient-gold gradient-gold-hover-bg text-primary-foreground">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {t("connexion.form.submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={successOpen} onOpenChange={setSuccessOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("connexion.form.success_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("connexion.form.success_body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>{t("connexion.form.success_ok")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
