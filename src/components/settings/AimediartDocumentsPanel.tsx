import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ExternalLink, FileText, Loader2, Trash2, Upload } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  type AimediartDocCategory,
  type AimediartDocument,
  deleteDocument,
  getDocumentSignedUrl,
  listDocuments,
  MAX_FILE_SIZE,
  uploadDocument,
} from "@/lib/aimediartDocuments";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.svg,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip";

function formatSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Gestion (liste + upload + suppression) des documents d'une catégorie. */
function DocumentManager({ category }: { category: AimediartDocCategory }) {
  const { t } = useTranslation("settings");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [docs, setDocs] = useState<AimediartDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listDocuments(category);
    if (error) toast.error(t("aimediart_docs.error_load", { detail: error }));
    else setDocs(data);
    setLoading(false);
  }, [category, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setUploading(true);
    let added = 0;
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(t("aimediart_docs.error_too_big", { name: file.name }));
        continue;
      }
      const { error } = await uploadDocument(category, file);
      if (error) toast.error(t("aimediart_docs.error_upload", { detail: error }));
      else added += 1;
    }
    if (added > 0) {
      toast.success(t("aimediart_docs.uploaded", { n: added }));
      await load();
    }
    setUploading(false);
  };

  const handleOpen = async (doc: AimediartDocument) => {
    setBusyId(doc.id);
    const url = await getDocumentSignedUrl(doc.bucket, doc.path);
    setBusyId(null);
    if (!url) {
      toast.error(t("aimediart_docs.error_open"));
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDelete = async (doc: AimediartDocument) => {
    if (!window.confirm(t("aimediart_docs.confirm_delete", { name: doc.name }))) return;
    setBusyId(doc.id);
    const { error } = await deleteDocument(doc);
    setBusyId(null);
    if (error) {
      toast.error(t("aimediart_docs.error_delete", { detail: error }));
      return;
    }
    toast.success(t("aimediart_docs.deleted"));
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("aimediart_docs.hint")}</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={handleFiles}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
          {t("aimediart_docs.btn_upload")}
        </Button>
      </div>

      {loading ? (
        <p className="py-2 text-sm text-muted-foreground">{t("aimediart_docs.loading")}</p>
      ) : docs.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 py-6 text-center text-sm text-muted-foreground">
          {t("aimediart_docs.empty")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/50 overflow-hidden rounded-md border border-border/50 bg-background/80">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={doc.name}>
                  {doc.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(doc.created_at).toLocaleDateString()}
                  {formatSize(doc.size_bytes) ? ` · ${formatSize(doc.size_bytes)}` : ""}
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                disabled={busyId === doc.id}
                title={t("aimediart_docs.open")}
                onClick={() => handleOpen(doc)}
              >
                {busyId === doc.id ? <Loader2 className="animate-spin" /> : <ExternalLink />}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive hover:text-destructive"
                disabled={busyId === doc.id}
                title={t("aimediart_docs.delete")}
                onClick={() => handleDelete(doc)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 3 accordéons de documents internes AIMEDIArt en bas de la page Contrôle IA. */
export function AimediartDocumentsPanel() {
  const { t } = useTranslation("settings");

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="aimediart-legal" className="border-border/50">
        <AccordionTrigger className="px-1 hover:no-underline">
          <span className="font-serif text-base font-bold">{t("aimediart_docs.legal_title")}</span>
        </AccordionTrigger>
        <AccordionContent className="px-1 pb-3">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="legal-inpi" className="border-border/50">
              <AccordionTrigger className="px-1 hover:no-underline">
                <span className="text-sm font-semibold">{t("aimediart_docs.inpi_title")}</span>
              </AccordionTrigger>
              <AccordionContent className="px-1 pb-3">
                <DocumentManager category="legal_inpi" />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="legal-societe" className="border-border/50">
              <AccordionTrigger className="px-1 hover:no-underline">
                <span className="text-sm font-semibold">{t("aimediart_docs.societe_title")}</span>
              </AccordionTrigger>
              <AccordionContent className="px-1 pb-3">
                <DocumentManager category="legal_societe" />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="aimediart-bp" className="border-border/50">
        <AccordionTrigger className="px-1 hover:no-underline">
          <span className="font-serif text-base font-bold">{t("aimediart_docs.bp_title")}</span>
        </AccordionTrigger>
        <AccordionContent className="px-1 pb-3">
          <DocumentManager category="bp" />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="aimediart-marketing" className="border-border/50">
        <AccordionTrigger className="px-1 hover:no-underline">
          <span className="font-serif text-base font-bold">{t("aimediart_docs.marketing_title")}</span>
        </AccordionTrigger>
        <AccordionContent className="px-1 pb-3">
          <DocumentManager category="marketing" />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export default AimediartDocumentsPanel;
