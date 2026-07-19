import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { CountryFlagIcon } from "@/components/CountryFlagIcon";
import { GoogleLogoIcon } from "@/components/OAuthProviderIcons";
import { TravelDiaryPreviewFlipbook } from "@/components/visitor/TravelDiaryPreviewFlipbook";
import { resolveProfileCountryLabel } from "@/components/users/UserProfileAddressFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { COUNTRY_OPTIONS, getCountryOption } from "@/lib/countries";
import { postalPlaceholderForCountryLabel } from "@/lib/postalCode";
import { startDiaryRegistrationOAuth } from "@/lib/visitorOAuth";
import { supabase } from "@/lib/supabase";
import { getOrCreateVisitorUuid } from "@/lib/visitorIdentity";
import {
  buildTravelDiaryShareUrl,
  createTravelDiaryShareLink,
} from "@/lib/travelDiaryShare";
import { resolveQrSiteOrigin } from "@/lib/oeuvrePublicUrl";
import {
  getStoredVisitorAgeInput,
  parseVisitorAge,
  setStoredVisitorAge,
} from "@/lib/visitorAgeStorage";
import { resolveFeedbackVisitorId } from "@/lib/registerAnonymousVisitorSession";

type Props = {
  open: boolean;
  expoId?: string | null;
  initialEmail?: string;
  initialFirstName?: string;
  initialLastName?: string;
  initialZipCode?: string;
  initialCity?: string;
  initialCountryCode?: string;
  isAuthenticated?: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const REQUIRED_MARK = <span className="text-[#E63946]">*</span>;
const FIELD_LABEL_CLASS = "text-xs";

function isEmailLike(value: string): boolean {
  return /\S+@\S+\.\S+/.test(value.trim());
}

export function VisitorDiaryRegistrationDialog({
  open,
  expoId,
  initialEmail = "",
  initialFirstName = "",
  initialLastName = "",
  initialZipCode = "",
  initialCity = "",
  initialCountryCode = "FR",
  isAuthenticated = false,
  onClose,
  onSuccess,
}: Props) {
  const { t } = useTranslation("visitor");
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [visitorAge, setVisitorAge] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [zipCode, setZipCode] = useState(initialZipCode);
  const [city, setCity] = useState(initialCity);
  const [country, setCountry] = useState(() => resolveProfileCountryLabel(null, initialCountryCode));
  const postalPlaceholder = useMemo(() => postalPlaceholderForCountryLabel(country), [country]);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFirstName(initialFirstName);
    setLastName(initialLastName);
    setVisitorAge(getStoredVisitorAgeInput());
    setEmail(initialEmail);
    setZipCode(initialZipCode);
    setCity(initialCity);
    setCountry(resolveProfileCountryLabel(null, initialCountryCode));
    setError(null);
  }, [open, initialFirstName, initialLastName, initialEmail, initialZipCode, initialCity, initialCountryCode]);

  if (!open) return null;

  const emailInvalid = email.trim().length > 0 && !isEmailLike(email);
  const ageInvalid = visitorAge.trim().length > 0 && parseVisitorAge(visitorAge) == null;

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    const { error: oauthError } = await startDiaryRegistrationOAuth();
    if (oauthError) {
      setGoogleLoading(false);
      toast.error(oauthError.message || t("diary.registration_google_error"));
    }
  };

  const handleSubmit = async () => {
    setError(null);
    const fn = firstName.trim();
    const ln = lastName.trim();
    const mail = email.trim();
    const zip = zipCode.trim();
    const c = city.trim();
    const countryLabel = country.trim();
    const countryCode = getCountryOption(countryLabel)?.iso?.toUpperCase() ?? null;
    const ageValue = parseVisitorAge(visitorAge.trim());

    if (!fn || !ln || !mail || !zip || !c || !countryLabel || ageValue == null) {
      setError(t("diary.registration_missing_fields"));
      return;
    }
    if (!isEmailLike(mail)) {
      setError(t("diary.registration_email_invalid"));
      return;
    }

    setSubmitting(true);
    try {
      let authUserId: string | null = null;

      if (isAuthenticated) {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) throw new Error(t("diary.registration_auth_error"));
        authUserId = uid;

        const { error: profileErr } = await supabase
          .from("profiles")
          .update({
            first_name: fn,
            last_name: ln,
            zip_code: zip,
            city: c,
            country: countryLabel,
            country_code: countryCode,
            updated_at: new Date().toISOString(),
          })
          .eq("id", uid);
        if (profileErr) throw new Error(profileErr.message);
      } else {
        const visitorUuid = getOrCreateVisitorUuid();
        // Liens e-mail : toujours le préfixe QR public (jamais localhost).
        const publicOrigin = resolveQrSiteOrigin();
        const redirectTo = `${publicOrigin}/reset-password?setup=1`;
        let diaryUrl = `${publicOrigin}/summary`;
        const expoTrimmed = expoId?.trim() || "";
        if (expoTrimmed) {
          diaryUrl = `${publicOrigin}/summary?expo_id=${encodeURIComponent(expoTrimmed)}`;
        }
        if (visitorUuid) {
          const share = await createTravelDiaryShareLink(visitorUuid, expoTrimmed || null);
          if (share?.token) {
            diaryUrl = buildTravelDiaryShareUrl(share.token, publicOrigin);
          }
        }
        const { data, error: fnErr } = await supabase.functions.invoke("register-visitor-instant", {
          body: {
            email: mail,
            prenom: fn,
            nom: ln,
            user_expo_id: expoTrimmed || null,
            visitor_uuid: visitorUuid || null,
            zip_code: zip,
            city: c,
            country: countryLabel,
            country_code: countryCode,
            send_password_setup_email: true,
            redirect_to: redirectTo,
            diary_url: diaryUrl,
          },
        });

        if (fnErr) throw new Error(fnErr.message);

        const payload = data as {
          ok?: boolean;
          error?: string;
          user_id?: string;
          password_setup_email_sent?: boolean;
        } | null;

        if (!payload?.ok) {
          throw new Error(payload?.error || t("diary.registration_unknown_error"));
        }

        authUserId = payload.user_id?.trim() || null;

        if (payload.password_setup_email_sent) {
          toast.success(t("diary.registration_email_sent", { email: mail }));
        }
      }

      const visitorId = resolveFeedbackVisitorId(authUserId);
      if (visitorId) {
        setStoredVisitorAge(ageValue);
        const { error: ageErr } = await supabase.rpc("patch_visitor_feedback_age", {
          p_visitor_id: visitorId,
          p_visitor_age: ageValue,
        });
        if (ageErr) throw new Error(ageErr.message);
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
      className="fixed inset-0 z-[130] overflow-hidden bg-black/65 px-3 py-4 sm:px-4 sm:py-6"
      onClick={onClose}
      role="presentation"
    >
      <div className="flex min-h-full items-start justify-center sm:items-center">
        <div
          className="my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-[390px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl sm:max-h-[calc(100vh-3rem)]"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t("diary.registration_title")}
        >
          <header className="relative z-20 flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2 sm:px-4">
            <p className="min-w-0 flex-1 text-sm font-bold leading-[19px] text-neutral-600">
              {t("diary.registration_desc_line1")}
            </p>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
              disabled={submitting}
              className="relative z-20 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#E63946] transition-colors hover:bg-[#E63946]/10 disabled:opacity-50"
              aria-label={t("btn_close")}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
          <div className="flex items-start gap-2">
            <div className="flex w-[105px] shrink-0 items-end justify-start self-start text-right">
              <TravelDiaryPreviewFlipbook
                variant="miniature"
                showHint={false}
                expoId={expoId}
                visitorFirstName={firstName}
                visitorLastName={lastName}
                className="shrink-0"
              />
            </div>
            <div className="relative flex w-[200px] shrink-0 flex-col self-start">
              <p className="w-full text-sm leading-[19px] text-neutral-600">
                {t("diary.registration_desc_line2")}
              </p>
              {!isAuthenticated ? (
                <Button
                  type="button"
                  variant="default"
                  className="absolute top-[100px] h-[44px] w-[243px] whitespace-normal border-2 border-neutral-400 !bg-white px-2 py-1 text-sm font-bold leading-[21px] !text-neutral-900 gradient-gold-hover-bg hover:!text-primary-foreground !shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_4px_14px_rgba(0,0,0,0.2)] hover:!shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_6px_18px_rgba(0,0,0,0.24)]"
                  disabled={googleLoading || submitting}
                  onClick={() => void handleGoogleSignIn()}
                >
                  {googleLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      {t("diary.registration_google_loading")}
                    </span>
                  ) : (
                    <span className="flex w-full flex-col items-center">
                      <span className="flex items-center gap-2">
                        <GoogleLogoIcon className="h-4 w-4 shrink-0" />
                        {t("diary.registration_google_line1")}
                      </span>
                      <span>{t("diary.registration_google_line2")}</span>
                    </span>
                  )}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-2 space-y-2">
            <div>
              <Label htmlFor="diary-first-name" className={FIELD_LABEL_CLASS}>
                {t("diary.field_first_name")} {REQUIRED_MARK}
              </Label>
              <Input
                id="diary-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-0.5 text-neutral-900"
                autoComplete="given-name"
              />
            </div>
            <div>
              <Label htmlFor="diary-last-name" className={FIELD_LABEL_CLASS}>
                {t("diary.field_last_name")} {REQUIRED_MARK}
              </Label>
              <Input
                id="diary-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-0.5 text-neutral-900"
                autoComplete="family-name"
              />
            </div>
            <div className="flex w-full items-start gap-2">
              <div className="w-[75px] shrink-0 min-w-0">
                <Label htmlFor="diary-age" className={FIELD_LABEL_CLASS}>
                  {t("diary.field_age")} {REQUIRED_MARK}
                </Label>
                <Input
                  id="diary-age"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={visitorAge}
                  onChange={(e) => setVisitorAge(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  className="mt-0.5 w-[70px] text-neutral-900"
                  autoComplete="off"
                  placeholder={t("diary.field_age_placeholder")}
                  aria-invalid={ageInvalid}
                />
                {ageInvalid ? (
                  <p className="mt-1 text-xs text-[#E63946]" role="alert">
                    {t("diary.field_age_invalid")}
                  </p>
                ) : null}
              </div>
              <div className="min-w-0">
                <Label htmlFor="diary-email" className={FIELD_LABEL_CLASS}>
                  {t("diary.field_email")} {REQUIRED_MARK}
                </Label>
                <Input
                  id="diary-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-0.5 w-[265px] text-neutral-900"
                  autoComplete="email"
                  disabled={isAuthenticated && Boolean(initialEmail)}
                  aria-invalid={emailInvalid}
                />
                {emailInvalid ? (
                  <p className="mt-1 text-xs text-[#E63946]" role="alert">
                    {t("diary.registration_email_invalid")}
                  </p>
                ) : null}
              </div>
            </div>
            {!isAuthenticated ? (
              <p className="text-[11px] leading-snug text-neutral-500">{t("diary.registration_password_hint")}</p>
            ) : null}
            <div className="space-y-1">
              <div className="flex items-end gap-2">
                <Label htmlFor="diary-country" className={`${FIELD_LABEL_CLASS} w-[46px] shrink-0`}>
                  {t("diary.field_country")} {REQUIRED_MARK}
                </Label>
                <Label htmlFor="diary-zip" className={`${FIELD_LABEL_CLASS} w-[88px] shrink-0`}>
                  {t("diary.field_zip")} {REQUIRED_MARK}
                </Label>
                <Label htmlFor="diary-city" className={`${FIELD_LABEL_CLASS} w-[200px] shrink-0`}>
                  {t("diary.field_city")} {REQUIRED_MARK}
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-[46px] shrink-0">
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger
                      id="diary-country"
                      aria-label={country || t("diary.field_country")}
                      className="mt-0 h-10 w-full justify-center px-1 text-neutral-900 [&>svg]:hidden"
                    >
                      <CountryFlagIcon iso={getCountryOption(country)?.iso} className="mx-auto" />
                    </SelectTrigger>
                    <SelectContent className="z-[140] max-h-72">
                      {COUNTRY_OPTIONS.map((option) => (
                        <SelectItem key={option.label} value={option.label} textValue={option.label}>
                          <span className="flex items-center gap-2">
                            <CountryFlagIcon iso={option.iso} />
                            <span>{option.label}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-[88px] shrink-0">
                  <Input
                    id="diary-zip"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    placeholder={postalPlaceholder}
                    className="mt-0 w-full items-start justify-start px-1 text-neutral-900"
                    autoComplete="postal-code"
                  />
                </div>
                <div className="w-[200px] shrink-0">
                  <Input
                    id="diary-city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="mt-0 w-full text-neutral-900"
                    autoComplete="address-level2"
                  />
                </div>
              </div>
            </div>
          </div>

          {error ? (
            <p className="mt-2 text-xs text-[#E63946]" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-3">
            <Button
              type="button"
              className="w-full gradient-gold gradient-gold-hover-bg text-primary-foreground"
              onClick={() => void handleSubmit()}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("diary.registration_submit")}
            </Button>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
