import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { TravelDiaryPreviewFlipbook } from "@/components/visitor/TravelDiaryPreviewFlipbook";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { getOrCreateVisitorUuid } from "@/lib/visitorIdentity";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  expoId?: string | null;
  initialEmail?: string;
  initialFirstName?: string;
  initialLastName?: string;
  initialZipCode?: string;
  initialCity?: string;
  isAuthenticated?: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const REQUIRED_MARK = <span className="text-[#E63946]">*</span>;

type DialogStep = "preview" | "form";

export function VisitorDiaryRegistrationDialog({
  open,
  expoId,
  initialEmail = "",
  initialFirstName = "",
  initialLastName = "",
  initialZipCode = "",
  initialCity = "",
  isAuthenticated = false,
  onClose,
  onSuccess,
}: Props) {
  const { t } = useTranslation("visitor");
  const [step, setStep] = useState<DialogStep>("preview");
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [email, setEmail] = useState(initialEmail);
  const [zipCode, setZipCode] = useState(initialZipCode);
  const [city, setCity] = useState(initialCity);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("preview");
    setFirstName(initialFirstName);
    setLastName(initialLastName);
    setEmail(initialEmail);
    setZipCode(initialZipCode);
    setCity(initialCity);
    setPassword("");
    setError(null);
  }, [open, initialFirstName, initialLastName, initialEmail, initialZipCode, initialCity]);

  if (!open) return null;

  const handleSubmit = async () => {
    setError(null);
    const fn = firstName.trim();
    const ln = lastName.trim();
    const mail = email.trim();
    const zip = zipCode.trim();
    const c = city.trim();

    if (!fn || !ln || !mail || !zip || !c) {
      setError(t("diary.registration_missing_fields"));
      return;
    }

    setSubmitting(true);
    try {
      if (isAuthenticated) {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) throw new Error(t("diary.registration_auth_error"));

        const { error: profileErr } = await supabase
          .from("profiles")
          .update({
            first_name: fn,
            last_name: ln,
            zip_code: zip,
            city: c,
            updated_at: new Date().toISOString(),
          })
          .eq("id", uid);
        if (profileErr) throw new Error(profileErr.message);
      } else {
        if (password.trim().length < 6) {
          setError(t("diary.registration_password_short"));
          setSubmitting(false);
          return;
        }

        const visitorUuid = getOrCreateVisitorUuid();
        const { data, error: fnErr } = await supabase.functions.invoke("register-visitor-instant", {
          body: {
            email: mail,
            password: password.trim(),
            prenom: fn,
            nom: ln,
            user_expo_id: expoId?.trim() || null,
            visitor_uuid: visitorUuid || null,
          },
        });

        if (fnErr) throw new Error(fnErr.message);

        const signIn = await supabase.auth.signInWithPassword({ email: mail, password: password.trim() });
        if (signIn.error) throw new Error(signIn.error.message);

        const authId = signIn.data.user?.id;
        if (authId && visitorUuid) {
          await supabase.rpc("link_visitor_to_auth_user", {
            p_visitor_client_id: visitorUuid,
            p_auth_user_id: authId,
          });
        }

        if (authId) {
          await supabase
            .from("profiles")
            .update({ zip_code: zip, city: c, updated_at: new Date().toISOString() })
            .eq("id", authId);
        }

        void data;
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("diary.registration_unknown_error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[130] overflow-y-auto px-3 py-4 sm:px-4 sm:py-6",
        step === "preview" ? "bg-[#121212]" : "bg-black/65",
      )}
      onClick={onClose}
      role="presentation"
    >
      <div className="flex min-h-full items-start justify-center sm:items-center">
        <div
          className={cn(
            "my-auto w-full",
            step === "preview"
              ? "max-w-[360px] bg-transparent px-0 py-0 shadow-none"
              : "max-w-[360px] rounded-xl border border-gray-200 bg-white p-4 shadow-xl sm:p-5",
          )}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={step === "preview" ? t("diary.registration_preview_aria") : t("diary.registration_title")}
        >
        {step === "preview" ? (
          <>
            <p className="px-1 text-center font-serif text-base font-bold text-[#F0F0F0]">
              {t("diary.registration_preview_teaser")}
            </p>
            <TravelDiaryPreviewFlipbook
              className="mt-3"
              expoId={expoId}
              visitorFirstName={firstName}
              visitorLastName={lastName}
            />
            <div className="mt-4 flex flex-col gap-2 px-1">
              <Button
                type="button"
                className="w-full gradient-gold gradient-gold-hover-bg text-primary-foreground"
                onClick={() => setStep("form")}
              >
                {t("diary.registration_preview_continue")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full border-white/25 bg-transparent text-[#F0F0F0] hover:bg-white/10"
                onClick={onClose}
              >
                {t("btn_close")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="font-serif text-lg font-bold text-neutral-900">{t("diary.registration_title")}</h2>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600">
              {t("diary.registration_desc_line1")}
              <br />
              {t("diary.registration_desc_line2")}
            </p>

            <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="diary-first-name" className="text-sm">
              {t("diary.field_first_name")} {REQUIRED_MARK}
            </Label>
            <Input
              id="diary-first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="mt-1 text-neutral-900"
              autoComplete="given-name"
            />
          </div>
          <div>
            <Label htmlFor="diary-last-name" className="text-sm">
              {t("diary.field_last_name")} {REQUIRED_MARK}
            </Label>
            <Input
              id="diary-last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="mt-1 text-neutral-900"
              autoComplete="family-name"
            />
          </div>
          <div>
            <Label htmlFor="diary-email" className="text-sm">
              {t("diary.field_email")} {REQUIRED_MARK}
            </Label>
            <Input
              id="diary-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 text-neutral-900"
              autoComplete="email"
              disabled={isAuthenticated && Boolean(initialEmail)}
            />
          </div>
          {!isAuthenticated ? (
            <div>
              <Label htmlFor="diary-password" className="text-sm">
                {t("diary.field_password")} {REQUIRED_MARK}
              </Label>
              <Input
                id="diary-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 text-neutral-900"
                autoComplete="new-password"
              />
            </div>
          ) : null}
          <div>
            <Label htmlFor="diary-zip" className="text-sm">
              {t("diary.field_zip")} {REQUIRED_MARK}
            </Label>
            <Input
              id="diary-zip"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              className="mt-1 text-neutral-900"
              autoComplete="postal-code"
            />
          </div>
          <div>
            <Label htmlFor="diary-city" className="text-sm">
              {t("diary.field_city")} {REQUIRED_MARK}
            </Label>
            <Input
              id="diary-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1 text-neutral-900"
              autoComplete="address-level2"
            />
          </div>
        </div>

        {error ? (
          <p className="mt-3 text-sm text-[#E63946]" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2">
          <Button
            type="button"
            className="w-full gradient-gold gradient-gold-hover-bg text-primary-foreground"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("diary.registration_submit")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setStep("preview")}
            disabled={submitting}
          >
            {t("diary.registration_back_preview")}
          </Button>
        </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
