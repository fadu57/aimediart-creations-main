/**
 * Shell d’édition partagé pour les pages légales publiques
 * (CGV, cookies, privacy, terms, ai_policy).
 * Admin 1 / juriste : édition, brouillon, commentaires.
 * Admin 1 : publication définitive + i18n 5 langues + PDF GED.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Printer,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PublicVitrineShell } from "@/components/PublicVitrineShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuthUser } from "@/hooks/useAuthUser";
import { canEditLegalPages, canPublishLegalPages } from "@/lib/authUser";
import {
  extractLegalCommentsFromHtml,
  fetchEditorLegalPage,
  fetchPublishedLegalPage,
  findLegalMark,
  mergeLegalComments,
  printLegalHtml,
  publishLegalPageDraft,
  saveLegalPageDraft,
  setLegalMarkComment,
  unwrapLegalMark,
  updateLegalMarkText,
  wrapSelectionWithLegalMark,
  type LegalCommentDraft,
  type LegalPageComment,
  type LegalPageContent,
  type LegalPageSlug,
} from "@/lib/legalDocuments";
import { LEGAL_GED_VALIDATION_FOLDER } from "@/lib/legalGedArchive";
import { PDF_LEGAL_DOC_CSS } from "@/pages/pdfLegalDocStyles";

type LocalComment = LegalCommentDraft;

export type LegalEditablePageProps = {
  slug: LegalPageSlug;
  /** Namespace i18n du contenu (meta.title, etc.). */
  contentNamespace: string;
  /** Document i18n complet (titre + meta + sections) si pas de HTML en base. */
  i18nFallback: ReactNode;
  /** Titre document (prioritaire sur contentNamespace meta.title). */
  documentTitle?: string;
};

export function LegalEditablePage({
  slug,
  contentNamespace,
  i18nFallback,
  documentTitle,
}: LegalEditablePageProps) {
  const { t } = useTranslation("legal_editor");
  const { t: tc } = useTranslation(contentNamespace);
  const pageTitle = (documentTitle?.trim() || tc("meta.title")).trim();
  const { user, role_id, role_name, global_role_id, loading: authLoading } = useAuthUser();
  const canEdit = canEditLegalPages(role_id, role_name);
  const canPublish = canPublishLegalPages(global_role_id);
  const { i18n } = useTranslation();
  const locale = (i18n.language || "fr").slice(0, 2).toLowerCase();

  const docRef = useRef<HTMLDivElement | null>(null);
  const [doc, setDoc] = useState<LegalPageContent | null>(null);
  const [comments, setComments] = useState<LocalComment[]>([]);
  const [draftHtml, setDraftHtml] = useState<string | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [pendingMark, setPendingMark] = useState<{ markId: string; quoteText: string } | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewMarkId, setReviewMarkId] = useState<string | null>(null);
  const [reviewQuote, setReviewQuote] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [activeMarkId, setActiveMarkId] = useState<string | null>(null);
  const [useI18nFallback, setUseI18nFallback] = useState(false);

  const collectCommentsFromDom = useCallback((): LocalComment[] => {
    const html = docRef.current?.innerHTML ?? "";
    return mergeLegalComments(comments, extractLegalCommentsFromHtml(html));
  }, [comments]);

  const reload = useCallback(async () => {
    setLoadingDoc(true);
    if (canEdit) {
      const { data, comments: dbComments, error } = await fetchEditorLegalPage(slug, locale);
      if (error && import.meta.env.DEV) console.warn(`[LegalEditablePage:${slug}]`, error);
      setDoc(data);
      setComments(
        dbComments.map((c: LegalPageComment) => ({
          markId: c.markId,
          quoteText: c.quoteText,
          body: c.body,
        })),
      );
      setUseI18nFallback(!data?.bodyHtml);
    } else {
      const { data, error } = await fetchPublishedLegalPage(slug, locale);
      if (error && import.meta.env.DEV) console.warn(`[LegalEditablePage:${slug}]`, error);
      setDoc(data);
      setComments([]);
      setUseI18nFallback(!data?.bodyHtml);
    }
    setLoadingDoc(false);
  }, [canEdit, locale, slug]);

  useEffect(() => {
    if (authLoading) return;
    void reload();
  }, [authLoading, reload]);

  useEffect(() => {
    if (editing || loadingDoc || !docRef.current) return;
    if (doc?.bodyHtml) {
      docRef.current.innerHTML = doc.bodyHtml;
      setUseI18nFallback(false);
    }
  }, [doc, editing, loadingDoc]);

  useEffect(() => {
    if (!editing || !docRef.current || draftHtml == null) return;
    docRef.current.innerHTML = draftHtml;
    docRef.current.focus();
  }, [editing, draftHtml]);

  useEffect(() => {
    const root = docRef.current;
    if (!root || editing) return;
    root.querySelectorAll<HTMLElement>("mark.legal-annotation[data-legal-cid]").forEach((el) => {
      const id = el.dataset.legalCid ?? "";
      const embedded = (el.getAttribute("data-legal-comment") || "").trim();
      const c = comments.find((x) => x.markId === id);
      el.title = c?.body || embedded || t("comment_click_hint");
      el.setAttribute("role", "button");
      el.tabIndex = 0;
    });
  }, [comments, doc, editing, loadingDoc, t]);

  const openReviewByMarkId = useCallback(
    (markId: string) => {
      if (!markId) return;
      const root = docRef.current;
      const mark = root ? findLegalMark(root, markId) : null;
      const fromState = comments.find((x) => x.markId === markId);
      const embedded = (mark?.getAttribute("data-legal-comment") || "").trim();
      const quoteFromDom = (mark?.textContent || "").trim();
      const body = (fromState?.body || embedded || "").trim();
      const quoteText = (fromState?.quoteText || quoteFromDom || "").trim();

      if (!body && !mark) {
        toast.message(t("comment_missing"));
        return;
      }

      setActiveMarkId(markId);
      setReviewMarkId(markId);
      setReviewQuote(quoteText);
      setReviewBody(body);
      setReviewOpen(true);
      mark?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [comments, t],
  );

  const onDocClick = (e: MouseEvent) => {
    if (!canEdit) return;
    const target = e.target as HTMLElement | null;
    const mark = target?.closest?.("mark.legal-annotation[data-legal-cid]") as HTMLElement | null;
    if (!mark) return;
    e.preventDefault();
    e.stopPropagation();
    openReviewByMarkId(mark.dataset.legalCid ?? "");
  };

  const isDraftView = canEdit && doc?.status === "draft";

  const handlePrint = () => {
    const bodyHtml =
      (editing ? docRef.current?.innerHTML : null) ||
      doc?.bodyHtml ||
      docRef.current?.innerHTML ||
      "";
    printLegalHtml({
      title: pageTitle,
      bodyHtml,
      includeAnnotations: canEdit,
    });
  };

  const startEdit = () => {
    const snapshot =
      doc?.bodyHtml ||
      (docRef.current && !useI18nFallback ? docRef.current.innerHTML : "") ||
      docRef.current?.innerHTML ||
      "";
    setDraftHtml(snapshot);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraftHtml(null);
    setCommentOpen(false);
    setPendingMark(null);
    setCommentBody("");
    void reload();
  };

  const persistDraft = async (opts?: { html?: string; nextComments?: LocalComment[] }) => {
    const html = (opts?.html ?? docRef.current?.innerHTML ?? "").trim();
    if (!html) {
      toast.error(t("empty"));
      return false;
    }
    const nextComments = opts?.nextComments ?? collectCommentsFromDom();
    setSaving(true);
    const { error, notifyError } = await saveLegalPageDraft({
      slug,
      locale,
      bodyHtml: html,
      userId: user?.id ?? null,
      comments: nextComments,
      notifyEmail: true,
    });
    setSaving(false);
    if (error) {
      toast.error(t("save_error", { detail: error }));
      return false;
    }
    if (notifyError) {
      toast.message(t("notify_warn", { detail: notifyError }));
    } else {
      toast.success(t("saved_draft_mail"));
    }
    return true;
  };

  const saveDraft = async () => {
    const ok = await persistDraft();
    if (!ok) return;
    setEditing(false);
    setDraftHtml(null);
    void reload();
  };

  const publishFinal = async () => {
    if (!canPublish) return;
    const html = (docRef.current?.innerHTML || doc?.bodyHtml || "").trim();
    if (!html) {
      toast.error(t("empty"));
      return;
    }
    setPublishing(true);
    toast.message(t("publishing_i18n"));
    const { error, publishedLocales, notifyError, partial } = await publishLegalPageDraft({
      slug,
      locale,
      bodyHtml: html,
      userId: user?.id ?? null,
    });

    if (error && !partial) {
      setPublishing(false);
      toast.error(t("publish_error", { detail: error }));
      return;
    }

    setEditing(false);
    setDraftHtml(null);
    setComments([]);

    if (partial) {
      toast.message(
        t("published_partial", {
          locales: publishedLocales.join(", ") || "—",
          detail: error || "",
        }),
      );
    } else {
      toast.success(
        t("published_i18n", {
          locales: publishedLocales.join(", ") || "fr, en, de, es, it",
        }),
      );
    }
    if (notifyError) {
      toast.message(t("publish_notify_warn", { detail: notifyError }));
    }

    toast.message(t("archiving_ged"));
    const { archiveValidatedLegalPdfToGed } = await import("@/lib/legalGedArchive");
    const ged = await archiveValidatedLegalPdfToGed({
      title: pageTitle,
      bodyHtml: html,
    });
    setPublishing(false);

    if (ged.error) {
      toast.message(t("ged_archive_warn", { detail: ged.error }));
    } else {
      toast.success(
        t("ged_archived", {
          file: ged.fileName || "PDF",
          folder: LEGAL_GED_VALIDATION_FOLDER,
        }),
      );
    }

    void reload();
  };

  const beginCommentOnSelection = () => {
    if (!docRef.current || !editing) {
      toast.error(t("comment_need_edit"));
      return;
    }
    const wrapped = wrapSelectionWithLegalMark(docRef.current);
    if (!wrapped) {
      toast.error(t("comment_need_selection"));
      return;
    }
    setPendingMark(wrapped);
    setCommentBody("");
    setCommentOpen(true);
  };

  const confirmComment = () => {
    if (!pendingMark || !docRef.current) return;
    const body = commentBody.trim();
    if (!body) {
      toast.error(t("comment_empty"));
      return;
    }
    setLegalMarkComment(docRef.current, pendingMark.markId, body);
    setComments((prev) =>
      mergeLegalComments(prev, [
        { markId: pendingMark.markId, quoteText: pendingMark.quoteText, body },
      ]),
    );
    setCommentOpen(false);
    setPendingMark(null);
    setCommentBody("");
    toast.success(t("comment_added"));
  };

  const cancelCommentDialog = () => {
    if (pendingMark && docRef.current) {
      unwrapLegalMark(docRef.current, pendingMark.markId);
    }
    setCommentOpen(false);
    setPendingMark(null);
    setCommentBody("");
  };

  const closeReview = () => {
    setReviewOpen(false);
    setReviewMarkId(null);
    setReviewQuote("");
    setReviewBody("");
    setActiveMarkId(null);
  };

  const validateReview = async () => {
    if (!reviewMarkId || !docRef.current) return;
    const body = reviewBody.trim();
    const quote = reviewQuote.trim();
    if (!body) {
      toast.error(t("comment_empty"));
      return;
    }
    if (!quote) {
      toast.error(t("quote_empty"));
      return;
    }

    updateLegalMarkText(docRef.current, reviewMarkId, quote);
    setLegalMarkComment(docRef.current, reviewMarkId, body);

    const nextComments = mergeLegalComments(comments, [
      { markId: reviewMarkId, quoteText: quote, body },
    ]);
    setComments(nextComments);
    closeReview();

    if (editing) {
      toast.success(t("review_validated_local"));
      return;
    }

    const ok = await persistDraft({ nextComments });
    if (ok) void reload();
  };

  const applyQuoteOnly = () => {
    if (!reviewMarkId || !docRef.current) return;
    const quote = reviewQuote.trim();
    if (!quote) {
      toast.error(t("quote_empty"));
      return;
    }
    if (!updateLegalMarkText(docRef.current, reviewMarkId, quote)) {
      toast.error(t("mark_not_found"));
      return;
    }
    setComments((prev) =>
      prev.map((c) => (c.markId === reviewMarkId ? { ...c, quoteText: quote } : c)),
    );
    toast.success(t("quote_applied"));
  };

  const deleteReview = async () => {
    if (!reviewMarkId || !docRef.current) return;
    unwrapLegalMark(docRef.current, reviewMarkId);
    const nextComments = comments.filter((c) => c.markId !== reviewMarkId);
    setComments(nextComments);
    closeReview();

    if (editing) {
      toast.success(t("comment_deleted_local"));
      return;
    }

    const ok = await persistDraft({ nextComments });
    if (ok) void reload();
  };

  return (
    <PublicVitrineShell vitrinePathPrefix="/organisation" atmosphericBackdrop>
      <style>{`
        mark.legal-annotation {
          background: #fef08a;
          padding: 0 2px;
          border-radius: 2px;
          cursor: pointer;
          box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
        }
        mark.legal-annotation:hover {
          background: #fde047;
          outline: 1px solid #d97706;
        }
        ${PDF_LEGAL_DOC_CSS}
      `}</style>
      <main className="mx-auto w-full max-w-[1060px] bg-[var(--tw-ring-offset-color)] px-5 pb-10 sm:px-6">
        <div className="rounded-2xl border border-[rgba(0,166,255,0.35)] bg-white px-5 py-8 shadow-[0_16px_48px_rgba(30,64,175,0.09)] backdrop-blur-xl sm:px-8 sm:py-10">
          {!authLoading && canEdit ? (
            <div className="mb-4 flex flex-col gap-3 print:hidden">
              {isDraftView || editing ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  {t("draft_banner")}
                </div>
              ) : null}
              {editing ? (
                <div className="h-12" aria-hidden />
              ) : (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={handlePrint}>
                    <Printer className="h-4 w-4" aria-hidden />
                    {t("print")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-2"
                    disabled={loadingDoc}
                    onClick={startEdit}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                    {t("edit")}
                  </Button>
                  {canPublish && isDraftView ? (
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2 bg-emerald-700 hover:bg-emerald-800"
                      disabled={loadingDoc || publishing || saving}
                      onClick={() => void publishFinal()}
                    >
                      {publishing ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" aria-hidden />
                      )}
                      {t("publish")}
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {editing && typeof document !== "undefined"
            ? createPortal(
                <div
                  className="pointer-events-none fixed inset-x-0 top-[4.25rem] z-[60] print:hidden"
                  role="toolbar"
                  aria-label={t("edit")}
                >
                  <div className="pointer-events-auto mx-auto w-full max-w-[1060px] px-5 sm:px-6">
                    <div className="flex flex-wrap items-center justify-end gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2.5 shadow-[0_10px_28px_rgba(30,64,175,0.18)]">
                      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={handlePrint}>
                        <Printer className="h-4 w-4" aria-hidden />
                        {t("print")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={beginCommentOnSelection}
                      >
                        <MessageSquarePlus className="h-4 w-4" aria-hidden />
                        {t("comment")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={saving || publishing}
                        onClick={cancelEdit}
                      >
                        <X className="h-4 w-4" aria-hidden />
                        {t("cancel")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="gap-2"
                        disabled={saving || publishing}
                        onClick={() => void saveDraft()}
                      >
                        {saving ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Save className="h-4 w-4" aria-hidden />
                        )}
                        {t("save_draft")}
                      </Button>
                      {canPublish ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          className="gap-2 bg-emerald-700 hover:bg-emerald-800"
                          disabled={saving || publishing}
                          onClick={() => void publishFinal()}
                        >
                          {publishing ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" aria-hidden />
                          )}
                          {t("publish")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>,
                document.body,
              )
            : null}

          {loadingDoc ? <p className="text-sm text-neutral-500">{t("loading")}</p> : null}

          <div
            ref={docRef}
            lang={locale === "fr" ? "fr" : locale}
            spellCheck={editing}
            className={
              editing
                ? "legal-doc-root legal-doc-root--editing rounded-lg px-3 py-4 sm:px-4"
                : "legal-doc-root"
            }
            contentEditable={editing || undefined}
            suppressContentEditableWarning
            onClick={onDocClick}
            style={
              editing
                ? {
                    outline: "2px solid rgba(217, 119, 6, 0.55)",
                    outlineOffset: 4,
                    backgroundColor: "#fff8e8",
                    boxShadow: "inset 0 0 0 1px rgba(251, 191, 36, 0.45)",
                  }
                : undefined
            }
          >
            {!editing && !loadingDoc && useI18nFallback ? i18nFallback : null}
          </div>

          {canEdit && !loadingDoc ? (
            <aside className="mt-8 space-y-3 border-t border-neutral-200 pt-6 print:hidden">
              <h2 className="text-sm font-semibold text-[#1f1f1f]">{t("comments_title")}</h2>
              <p className="text-xs text-neutral-500">{t("comments_help")}</p>
              {comments.length === 0 ? (
                <p className="text-sm text-neutral-500">{t("comments_empty")}</p>
              ) : (
                <ul className="space-y-3">
                  {comments.map((c) => (
                    <li key={c.markId}>
                      <button
                        type="button"
                        onClick={() => openReviewByMarkId(c.markId)}
                        className={`w-full rounded-md border px-3 py-2 text-left text-sm text-[#1f1f1f] transition-colors ${
                          activeMarkId === c.markId
                            ? "border-amber-500 bg-amber-100"
                            : "border-amber-200 bg-amber-50/80 hover:bg-amber-100"
                        }`}
                      >
                        <p className="text-xs italic text-neutral-600">« {c.quoteText} »</p>
                        <p className="mt-1">{c.body}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          ) : null}
        </div>
      </main>

      <Dialog
        open={commentOpen}
        onOpenChange={(o) => {
          if (!o) cancelCommentDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("comment_dialog_title")}</DialogTitle>
          </DialogHeader>
          {pendingMark ? (
            <p className="text-xs italic text-muted-foreground">« {pendingMark.quoteText} »</p>
          ) : null}
          <Textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            rows={4}
            placeholder={t("comment_placeholder")}
            className="mt-2"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={cancelCommentDialog}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={confirmComment}>
              {t("comment_confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reviewOpen}
        onOpenChange={(o) => {
          if (!o) closeReview();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("review_title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="legal-review-quote">{t("review_quote_label")}</Label>
              <Textarea
                id="legal-review-quote"
                value={reviewQuote}
                onChange={(e) => setReviewQuote(e.target.value)}
                rows={3}
              />
              <Button type="button" variant="outline" size="sm" onClick={applyQuoteOnly}>
                {t("review_apply_quote")}
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="legal-review-body">{t("review_body_label")}</Label>
              <Textarea
                id="legal-review-body"
                value={reviewBody}
                onChange={(e) => setReviewBody(e.target.value)}
                rows={4}
                placeholder={t("comment_placeholder")}
              />
            </div>
          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              className="gap-2"
              disabled={saving}
              onClick={() => void deleteReview()}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("review_delete")}
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={closeReview}>
                {t("close")}
              </Button>
              <Button
                type="button"
                className="gap-2"
                disabled={saving}
                onClick={() => void validateReview()}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                )}
                {t("review_validate")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PublicVitrineShell>
  );
}
