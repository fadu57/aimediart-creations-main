import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "@/components/ui/sonner";

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
import { SmartPhoneInput } from "@/components/SmartPhoneInput";

async function submitConnectedExpoQuote(
  values: ConnectedExpoQuoteFormValues,
  floorPlanFile: File | null,
): Promise<{ warn_floor_plan?: boolean; warn_email?: boolean; email_errors?: string[] }> {
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
  if (values.preferred_contact_time.trim()) {
    formData.append("preferred_contact_time", values.preferred_contact_time.trim());
  }
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
    warn_email?: boolean;
    email_errors?: string[];
  };
  if (!res.ok) {
    throw new Error(payload.error ?? `HTTP ${res.status}`);
  }
  return {
    warn_floor_plan: payload.warn_floor_plan,
    warn_email: payload.warn_email,
    email_errors: payload.email_errors,
  };
}

export type ConnectedExpoQuoteFormValues = {
  org_name: string;
  contact_name: string;
  contact_email: string;
  address: string;
  zip_code: string;
  city: string;
  contact_phone: string;
  preferred_contact_time: string;
  need_description: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultOrgName?: string;
  /** Titre du dialogue (défaut : Pack connexion). */
  title?: string;
  /** Afficher le champ plan de salle (défaut : true). */
  showFloorPlan?: boolean;
  /** Libellé du champ description (défaut : Pack connexion). */
  needDescriptionLabel?: string;
};

const EMPTY: ConnectedExpoQuoteFormValues = {
  org_name: "",
  contact_name: "",
  contact_email: "",
  address: "",
  zip_code: "",
  city: "",
  contact_phone: "",
  preferred_contact_time: "",
  need_description: "",
};

const DIALOG_CLASS =
  "box-border flex h-[min(800px,90vh)] w-[calc(100vw-2rem)] !max-w-[700px] max-w-[700px] flex-col gap-4 overflow-x-hidden overflow-y-hidden p-4 sm:p-6";
const FORM_CLASS =
  "flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto [&_input]:box-border [&_input]:min-w-0 [&_input]:max-w-full [&_input]:w-full [&_input]:focus-visible:outline-none [&_input]:focus-visible:ring-2 [&_input]:focus-visible:ring-inset [&_input]:focus-visible:ring-ring [&_input]:focus-visible:ring-offset-0 [&_textarea]:box-border [&_textarea]:min-w-0 [&_textarea]:max-w-full [&_textarea]:w-full [&_textarea]:focus-visible:outline-none [&_textarea]:focus-visible:ring-2 [&_textarea]:focus-visible:ring-inset [&_textarea]:focus-visible:ring-ring [&_textarea]:focus-visible:ring-offset-0";
const FIELD_CLASS = "flex w-full min-w-0 flex-col gap-1.5";
const INPUT_CLASS =
  "pl-6 pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-0";
const TEXTAREA_CLASS =
  "h-[200px] resize-y pl-6 pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-0";

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
  title,
  showFloorPlan = true,
  needDescriptionLabel,
}: Props) {
  const { t } = useTranslation("home");
  const dialogTitle = title?.trim() || t("connexion.form.title");
  const needLabel = needDescriptionLabel?.trim() || t("connexion.form.need_description");
  const [values, setValues] = useState<ConnectedExpoQuoteFormValues>(EMPTY);
  const [floorPlanFile, setFloorPlanFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [phoneValid, setPhoneValid] = useState(true);

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
    setPhoneValid(true);
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
    if (!phoneValid) {
      toast.error(t("connexion.form.error_phone"));
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitConnectedExpoQuote(values, floorPlanFile);
      if (result.warn_floor_plan) {
        toast.warning(t("connexion.form.warn_floor_plan"));
      }
      if (result.warn_email) {
        const detail = result.email_errors?.filter(Boolean).join(" — ");
        toast.warning(
          detail
            ? t("connexion.form.warn_email_detail", { detail })
            : t("connexion.form.warn_email"),
        );
      }

      onOpenChange(false);
      resetForm();
      toast.custom(
        () => (
          <div
            role="status"
            aria-live="polite"
            className="w-[700px] max-w-[calc(100vw-2rem)] rounded-xl border-2 border-[hsl(var(--gold))] bg-white px-6 py-5 shadow-[0_8px_32px_hsl(var(--gold)/0.28)]"
          >
            <p className="text-lg font-semibold leading-snug text-neutral-950">
              {t("connexion.form.success_title")}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-neutral-800">
              {t("connexion.form.success_body")}
            </p>
          </div>
        ),
        {
          duration: 10_000,
          unstyled: true,
          className: "sonner-quote-success-toast",
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/relation ["']?connected_expo_quote_requests["']? does not exist/i.test(msg)) {
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
        <DialogContent className={DIALOG_CLASS}>
          <DialogHeader className="shrink-0">
            <DialogTitle>{dialogTitle}</DialogTitle>
            <p className="text-xs font-normal italic text-[#E63946]">{t("connexion.form.required_hint")}</p>
          </DialogHeader>
          <form className={FORM_CLASS} onSubmit={(e) => void handleSubmit(e)}>
            <div className={FIELD_CLASS}>
              <Label htmlFor="ceq-org">
                {t("connexion.form.org_name")}
                <RequiredAsterisk />
              </Label>
              <Input
                id="ceq-org"
                className={INPUT_CLASS}
                value={values.org_name}
                onChange={(e) => setField("org_name", e.target.value)}
                required
              />
            </div>
            <div className={FIELD_CLASS}>
              <Label htmlFor="ceq-contact">
                {t("connexion.form.contact_name")}
                <RequiredAsterisk />
              </Label>
              <Input
                id="ceq-contact"
                className={INPUT_CLASS}
                value={values.contact_name}
                onChange={(e) => setField("contact_name", e.target.value)}
                required
              />
            </div>
            <div className={FIELD_CLASS}>
              <Label htmlFor="ceq-email">
                {t("connexion.form.contact_email")}
                <RequiredAsterisk />
              </Label>
              <Input
                id="ceq-email"
                type="email"
                className={INPUT_CLASS}
                value={values.contact_email}
                onChange={(e) => setField("contact_email", e.target.value)}
                required
              />
            </div>
            <div className={FIELD_CLASS}>
              <Label htmlFor="ceq-address">{t("connexion.form.address")}</Label>
              <Input
                id="ceq-address"
                className={INPUT_CLASS}
                value={values.address}
                onChange={(e) => setField("address", e.target.value)}
              />
            </div>
            <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <div className={FIELD_CLASS}>
                <Label htmlFor="ceq-zip">{t("connexion.form.zip_code")}</Label>
                <Input
                  id="ceq-zip"
                  className={INPUT_CLASS}
                  value={values.zip_code}
                  onChange={(e) => setField("zip_code", e.target.value)}
                />
              </div>
              <div className={FIELD_CLASS}>
                <Label htmlFor="ceq-city">{t("connexion.form.city")}</Label>
                <Input
                  id="ceq-city"
                  className={INPUT_CLASS}
                  value={values.city}
                  onChange={(e) => setField("city", e.target.value)}
                />
              </div>
            </div>
            <div className={FIELD_CLASS}>
              <Label htmlFor="ceq-phone">
                {t("connexion.form.contact_phone")}
                <RequiredAsterisk />
              </Label>
              <SmartPhoneInput
                id="ceq-phone"
                value={values.contact_phone}
                onChange={(value) => setField("contact_phone", value)}
                onValidityChange={setPhoneValid}
                disabled={submitting}
                className="w-full [&_button]:h-10 [&_input]:h-10 [&_input]:text-sm"
              />
            </div>
            <div className={FIELD_CLASS}>
              <Label htmlFor="ceq-contact-time">{t("connexion.form.preferred_contact_time")}</Label>
              <Input
                id="ceq-contact-time"
                className={INPUT_CLASS}
                value={values.preferred_contact_time}
                onChange={(e) => setField("preferred_contact_time", e.target.value)}
              />
            </div>
            <div className={FIELD_CLASS}>
              <Label htmlFor="ceq-need">
                {needLabel}
                <RequiredAsterisk />
              </Label>
              <Textarea
                id="ceq-need"
                rows={showFloorPlan ? 4 : 6}
                className={TEXTAREA_CLASS}
                value={values.need_description}
                onChange={(e) => setField("need_description", e.target.value)}
                required
              />
            </div>
            {showFloorPlan ? (
              <div className={FIELD_CLASS}>
                <Label htmlFor="ceq-plan">{t("connexion.form.floor_plan")}</Label>
                <p className="text-xs text-muted-foreground">{t("connexion.form.floor_plan_accept")}</p>
                <Input
                  id="ceq-plan"
                  type="file"
                  className="pl-3 pr-3"
                  accept=".pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf"
                  onChange={(e) => setFloorPlanFile(e.target.files?.[0] ?? null)}
                />
              </div>
            ) : null}
            <DialogFooter className="mt-auto w-full min-w-0 shrink-0 gap-2 sm:gap-0">
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
    </>
  );
}
