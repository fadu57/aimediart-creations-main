import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Check,
  ExternalLink,
  FileText,
  Folder,
  FolderPlus,
  Link2,
  Loader2,
  FolderInput,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useNavigationMatrix } from "@/hooks/useNavigationMatrix";
import { cn } from "@/lib/utils";
import {
  type AimediartDocCategory,
  type AimediartDocument,
  type AimediartDocumentFolder,
  type AimediartGedSection,
  createFolder,
  createGedSection,
  deleteDocument,
  deleteFolder,
  deleteGedSection,
  getGedShareUrl,
  getDocumentSignedUrl,
  countDocuments,
  listDocuments,
  listFolders,
  listGedSections,
  MAX_FILE_SIZE,
  moveDocument,
  renameFolder,
  renameGedSection,
  uploadDocument,
} from "@/lib/aimediartDocuments";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.svg,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip";

function formatSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function useIsLgUp(): boolean {
  const [isLg, setIsLg] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : false,
  );
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsLg(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);
  return isLg;
}

/** Deux cartes distinctes côte à côte (lg+ uniquement). */
function TwoColumnBlocks({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  const cardClass =
    "min-w-0 flex-1 rounded-lg border border-border/50 bg-white/90 p-2 text-neutral-900 shadow-none md:p-3 [&_.text-muted-foreground]:text-neutral-600";

  return (
    <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
      <div className={cardClass}>{left}</div>
      <div className={cardClass}>{right}</div>
    </div>
  );
}

/** Un seul bloc (mobile / écrans < lg). */
function SingleBlock({ children }: { children: ReactNode }) {
  return (
    <div className="w-full rounded-lg border border-border/50 bg-white/90 p-2 text-neutral-900 shadow-none md:p-3 [&_.text-muted-foreground]:text-neutral-600">
      {children}
    </div>
  );
}

function splitTwoColumns<T>(items: T[]): [T[], T[]] {
  const left: T[] = [];
  const right: T[] = [];
  for (let i = 0; i < items.length; i++) {
    (i % 2 === 0 ? left : right).push(items[i]!);
  }
  return [left, right];
}

type DocRowProps = {
  doc: AimediartDocument;
  folders: AimediartDocumentFolder[];
  busyId: string | null;
  onOpen: (doc: AimediartDocument) => void;
  onShare: (doc: AimediartDocument) => void;
  onMove: (doc: AimediartDocument, folderId: string | null) => void;
  onDelete: (doc: AimediartDocument) => void;
};

function DocRow({ doc, folders, busyId, onOpen, onShare, onMove, onDelete }: DocRowProps) {
  const { t } = useTranslation("settings");
  const busy = busyId === doc.id;

  return (
    <li className="flex items-center gap-2 px-2 py-1 sm:gap-2">
      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-medium" title={doc.name}>
          {doc.name}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {new Date(doc.created_at).toLocaleDateString()}
          {formatSize(doc.size_bytes) ? ` · ${formatSize(doc.size_bytes)}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={busy}
          title={t("aimediart_docs.open")}
          onClick={() => onOpen(doc)}
        >
          {busy ? <Loader2 className="animate-spin" /> : <ExternalLink />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={busy}
              title={t("aimediart_docs.move")}
            >
              <FolderInput />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem
              disabled={doc.folder_id === null}
              onClick={() => onMove(doc, null)}
            >
              {t("aimediart_docs.move_to_root")}
            </DropdownMenuItem>
            {folders.map((f) => (
              <DropdownMenuItem
                key={f.id}
                disabled={doc.folder_id === f.id}
                onClick={() => onMove(doc, f.id)}
              >
                {f.name}
              </DropdownMenuItem>
            ))}
            {folders.length === 0 && (
              <DropdownMenuItem disabled>{t("aimediart_docs.no_folders")}</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={busy}
          title={t("aimediart_docs.share")}
          onClick={() => onShare(doc)}
        >
          <Link2 />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive hover:text-destructive"
          disabled={busy}
          title={t("aimediart_docs.delete")}
          onClick={() => onDelete(doc)}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

type DocListProps = {
  docs: AimediartDocument[];
  folders: AimediartDocumentFolder[];
  busyId: string | null;
  emptyLabel: string;
  onOpen: (doc: AimediartDocument) => void;
  onShare: (doc: AimediartDocument) => void;
  onMove: (doc: AimediartDocument, folderId: string | null) => void;
  onDelete: (doc: AimediartDocument) => void;
};

function DocList({
  docs,
  folders,
  busyId,
  emptyLabel,
  onOpen,
  onShare,
  onMove,
  onDelete,
}: DocListProps) {
  if (docs.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border/60 py-2 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border/50 overflow-hidden rounded-md border border-border/50 bg-background/80">
      {docs.map((doc) => (
        <DocRow
          key={doc.id}
          doc={doc}
          folders={folders}
          busyId={busyId}
          onOpen={onOpen}
          onShare={onShare}
          onMove={onMove}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

/** Gestion (liste + upload + dossiers + suppression) des documents d'une catégorie. */
function DocumentManager({
  category,
  onDocsCountChange,
  onNestedOpenChange,
}: {
  category: AimediartDocCategory;
  onDocsCountChange?: (count: number) => void;
  /** true si un sous-dossier est ouvert (pour masquer les boutons de l’étage section). */
  onNestedOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation("settings");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<string | null>(null);
  const onDocsCountChangeRef = useRef(onDocsCountChange);
  onDocsCountChangeRef.current = onDocsCountChange;
  const onNestedOpenChangeRef = useRef(onNestedOpenChange);
  onNestedOpenChangeRef.current = onNestedOpenChange;
  const [docs, setDocs] = useState<AimediartDocument[]>([]);
  const [folders, setFolders] = useState<AimediartDocumentFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [openFolderId, setOpenFolderId] = useState<string>("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [docsRes, foldersRes] = await Promise.all([
      listDocuments(category),
      listFolders(category),
    ]);
    if (docsRes.error) toast.error(t("aimediart_docs.error_load", { detail: docsRes.error }));
    else {
      setDocs(docsRes.data);
      onDocsCountChangeRef.current?.(docsRes.data.length);
    }
    if (foldersRes.error) {
      toast.error(t("aimediart_docs.error_load", { detail: foldersRes.error }));
    } else {
      setFolders(foldersRes.data);
    }
    setLoading(false);
  }, [category, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onNestedOpenChangeRef.current?.(Boolean(openFolderId));
  }, [openFolderId]);

  useEffect(() => {
    return () => onNestedOpenChangeRef.current?.(false);
  }, []);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    const folderId = uploadTargetRef.current;
    const folder = folderId ? folders.find((f) => f.id === folderId) : null;

    setUploading(true);
    let added = 0;
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(t("aimediart_docs.error_too_big", { name: file.name }));
        continue;
      }
      const { error } = await uploadDocument(
        category,
        file,
        folderId,
        folder?.name ?? null,
      );
      if (error) toast.error(t("aimediart_docs.error_upload", { detail: error }));
      else added += 1;
    }
    if (added > 0) {
      toast.success(t("aimediart_docs.uploaded", { n: added }));
      await load();
    }
    setUploading(false);
    uploadTargetRef.current = null;
  };

  const triggerUpload = (folderId: string | null) => {
    uploadTargetRef.current = folderId;
    fileInputRef.current?.click();
  };

  const handleCreateFolder = async () => {
    const name = window.prompt(t("aimediart_docs.folder_name_prompt"));
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("aimediart_docs.error_folder_empty"));
      return;
    }
    const { error } = await createFolder(category, trimmed);
    if (error) {
      toast.error(t("aimediart_docs.error_folder_create", { detail: error }));
      return;
    }
    toast.success(t("aimediart_docs.folder_created"));
    await load();
  };

  const handleDeleteFolder = async (folder: AimediartDocumentFolder) => {
    if (!window.confirm(t("aimediart_docs.confirm_delete_folder", { name: folder.name }))) {
      return;
    }
    setBusyId(folder.id);
    const { error } = await deleteFolder(folder);
    setBusyId(null);
    if (error === "folder_not_empty") {
      toast.error(t("aimediart_docs.error_folder_not_empty"));
      return;
    }
    if (error) {
      toast.error(t("aimediart_docs.error_folder_delete", { detail: error }));
      return;
    }
    toast.success(t("aimediart_docs.folder_deleted"));
    setFolders((prev) => prev.filter((f) => f.id !== folder.id));
  };

  const startRenameFolder = (folder: AimediartDocumentFolder) => {
    setRenamingId(folder.id);
    setRenameValue(folder.name);
    queueMicrotask(() => renameInputRef.current?.focus());
  };

  const cancelRenameFolder = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  const submitRenameFolder = async (folder: AimediartDocumentFolder) => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      toast.error(t("aimediart_docs.error_folder_empty"));
      return;
    }
    if (trimmed === folder.name) {
      cancelRenameFolder();
      return;
    }
    setBusyId(folder.id);
    const { data, error } = await renameFolder(folder.id, trimmed);
    setBusyId(null);
    if (error) {
      toast.error(t("aimediart_docs.error_folder_rename", { detail: error }));
      return;
    }
    toast.success(t("aimediart_docs.folder_renamed"));
    if (data) {
      setFolders((prev) =>
        prev.map((f) => (f.id === folder.id ? { ...f, name: data.name } : f)),
      );
    }
    cancelRenameFolder();
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

  const copyShareToken = async (shareToken: string | undefined | null) => {
    const url = getGedShareUrl(shareToken ?? "");
    if (!url) {
      toast.error(t("aimediart_docs.error_share"));
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("aimediart_docs.share_copied"));
    } catch {
      window.prompt(t("aimediart_docs.share_copy_manual"), url);
    }
  };

  const handleShare = async (doc: AimediartDocument) => {
    await copyShareToken(doc.share_token);
  };

  const handleShareFolder = async (folder: AimediartDocumentFolder) => {
    await copyShareToken(folder.share_token);
  };

  const handleMove = async (doc: AimediartDocument, folderId: string | null) => {
    setBusyId(doc.id);
    const { error } = await moveDocument(doc.id, folderId);
    setBusyId(null);
    if (error) {
      toast.error(t("aimediart_docs.error_move", { detail: error }));
      return;
    }
    toast.success(t("aimediart_docs.moved"));
    setDocs((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, folder_id: folderId } : d)),
    );
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

  const rootDocs = docs.filter((d) => d.folder_id == null);

  return (
    <div className="flex flex-col gap-2">
      {!openFolderId && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{t("aimediart_docs.hint")}</p>
          <div className="flex items-center gap-1.5">
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
              className="h-7"
              disabled={uploading}
              onClick={() => void handleCreateFolder()}
            >
              <FolderPlus />
              {t("aimediart_docs.btn_new_folder")}
            </Button>
          </div>
        </div>
      )}
      {openFolderId && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={handleFiles}
        />
      )}

      {loading ? (
        <p className="py-2 text-sm text-muted-foreground">{t("aimediart_docs.loading")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {folders.length > 0 && (
            <Accordion
              type="single"
              collapsible
              className="w-full"
              value={openFolderId}
              onValueChange={setOpenFolderId}
            >
              {folders.map((folder) => {
                const folderDocs = docs.filter((d) => d.folder_id === folder.id);
                const isRenaming = renamingId === folder.id;
                const folderOpen = openFolderId === folder.id;
                return (
                  <AccordionItem
                    key={folder.id}
                    value={folder.id}
                    className="border-border/50"
                  >
                    <div className="relative flex w-full min-h-8 items-center">
                      {isRenaming ? (
                        <div
                          className="flex flex-1 items-center gap-1.5 px-1 py-1"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <Input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="h-7"
                            aria-label={t("aimediart_docs.rename_folder")}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void submitRenameFolder(folder);
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                cancelRenameFolder();
                              }
                            }}
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            disabled={busyId === folder.id}
                            title={t("aimediart_docs.rename_folder")}
                            onClick={() => void submitRenameFolder(folder)}
                          >
                            {busyId === folder.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            disabled={busyId === folder.id}
                            onClick={cancelRenameFolder}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <AccordionTrigger className="w-full px-1 py-1.5 hover:no-underline [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0">
                            <span
                              className={cn(
                                "flex min-w-0 flex-1 items-center gap-1.5 truncate text-left text-sm font-semibold leading-tight",
                                folderOpen ? "pr-36" : "pr-8",
                              )}
                            >
                              <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                              {folder.name}
                              <span className="font-normal text-muted-foreground">
                                ({folderDocs.length})
                              </span>
                            </span>
                          </AccordionTrigger>
                          {folderOpen && (
                            <div className="pointer-events-none absolute inset-y-0 right-7 z-10 flex items-center gap-0.5">
                              <div className="pointer-events-auto flex items-center gap-0.5 rounded-md bg-background/90">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 shrink-0 gap-1 px-2"
                                  disabled={uploading}
                                  title={t("aimediart_docs.btn_upload_folder_title")}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    triggerUpload(folder.id);
                                  }}
                                >
                                  {uploading ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Upload className="h-3.5 w-3.5" />
                                  )}
                                  <span className="hidden sm:inline">{t("aimediart_docs.btn_upload")}</span>
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 shrink-0"
                                  disabled={!folder.share_token}
                                  title={t("aimediart_docs.share_folder")}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleShareFolder(folder);
                                  }}
                                >
                                  <Link2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 shrink-0"
                                  disabled={busyId === folder.id}
                                  title={t("aimediart_docs.rename_folder")}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startRenameFolder(folder);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                                  disabled={busyId === folder.id || folderDocs.length > 0}
                                  title={t("aimediart_docs.delete_folder")}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleDeleteFolder(folder);
                                  }}
                                >
                                  {busyId === folder.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <AccordionContent className="px-1 pb-2">
                      <DocList
                        docs={folderDocs}
                        folders={folders}
                        busyId={busyId}
                        emptyLabel={t("aimediart_docs.empty")}
                        onOpen={handleOpen}
                        onShare={handleShare}
                        onMove={handleMove}
                        onDelete={handleDelete}
                      />
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}

          {!openFolderId && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t("aimediart_docs.root_files")}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                disabled={uploading}
                title={t("aimediart_docs.btn_upload_root_title")}
                onClick={() => triggerUpload(null)}
              >
                {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                {t("aimediart_docs.btn_upload")}
              </Button>
            </div>
            <DocList
              docs={rootDocs}
              folders={folders}
              busyId={busyId}
              emptyLabel={
                folders.length === 0
                  ? t("aimediart_docs.empty")
                  : t("aimediart_docs.empty_root")
              }
              onOpen={handleOpen}
              onShare={handleShare}
              onMove={handleMove}
              onDelete={handleDelete}
            />
          </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Accordéons de documents internes AIMEDIArt, filtrés par la matrice d'accès. */
export function AimediartDocumentsPanel({ hideTitle = false }: { hideTitle?: boolean } = {}) {
  const { t } = useTranslation("settings");
  const { can } = useNavigationMatrix();
  const isLgUp = useIsLgUp();
  const [sections, setSections] = useState<AimediartGedSection[]>([]);
  const [sectionDocCounts, setSectionDocCounts] = useState<Record<string, number>>({});
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [renamingSectionId, setRenamingSectionId] = useState<string | null>(null);
  const [sectionRenameValue, setSectionRenameValue] = useState("");
  const [sectionBusy, setSectionBusy] = useState(false);
  const [openSectionSlug, setOpenSectionSlug] = useState<string>("");
  const [nestedFolderOpen, setNestedFolderOpen] = useState(false);
  const sectionRenameRef = useRef<HTMLInputElement | null>(null);

  const loadSections = useCallback(async () => {
    setSectionsLoading(true);
    const { data, error } = await listGedSections();
    if (error) {
      toast.error(t("aimediart_docs.error_load", { detail: error }));
      setSectionsLoading(false);
      return;
    }
    setSections(data);
    const counts = await Promise.all(
      data.map(async (section) => {
        const { count } = await countDocuments(section.slug);
        return [section.slug, count] as const;
      }),
    );
    setSectionDocCounts(Object.fromEntries(counts));
    setSectionsLoading(false);
  }, [t]);

  useEffect(() => {
    void loadSections();
  }, [loadSections]);

  // Accès commun « GED » : un seul contrôle pilote les 3 sections.
  if (!can("page_group_ged")) return null;

  const setSectionCount = (slug: string, count: number) => {
    setSectionDocCounts((prev) => (prev[slug] === count ? prev : { ...prev, [slug]: count }));
  };

  const copySectionShare = async (section: AimediartGedSection) => {
    const url = getGedShareUrl(section.share_token);
    if (!url) {
      toast.error(t("aimediart_docs.error_share"));
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("aimediart_docs.share_copied"));
    } catch {
      window.prompt(t("aimediart_docs.share_copy_manual"), url);
    }
  };

  const startRenameSection = (section: AimediartGedSection) => {
    setRenamingSectionId(section.id);
    setSectionRenameValue(section.name);
    queueMicrotask(() => sectionRenameRef.current?.focus());
  };

  const cancelRenameSection = () => {
    setRenamingSectionId(null);
    setSectionRenameValue("");
  };

  const submitRenameSection = async (section: AimediartGedSection) => {
    const trimmed = sectionRenameValue.trim();
    if (!trimmed) {
      toast.error(t("aimediart_docs.error_folder_empty"));
      return;
    }
    if (trimmed === section.name) {
      cancelRenameSection();
      return;
    }
    setSectionBusy(true);
    const { data, error } = await renameGedSection(section.id, trimmed);
    setSectionBusy(false);
    if (error) {
      toast.error(t("aimediart_docs.error_folder_rename", { detail: error }));
      return;
    }
    if (data) {
      setSections((prev) => prev.map((s) => (s.id === section.id ? data : s)));
    }
    toast.success(t("aimediart_docs.folder_renamed"));
    cancelRenameSection();
  };

  const handleCreateSection = async () => {
    const name = window.prompt(t("aimediart_docs.section_name_prompt"));
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("aimediart_docs.error_folder_empty"));
      return;
    }
    setSectionBusy(true);
    const { data, error } = await createGedSection(trimmed);
    setSectionBusy(false);
    if (error) {
      toast.error(t("aimediart_docs.error_section_create", { detail: error }));
      return;
    }
    toast.success(t("aimediart_docs.section_created"));
    if (data) setSections((prev) => [...prev, data]);
    else await loadSections();
  };

  const handleDeleteSection = async (section: AimediartGedSection) => {
    if (!window.confirm(t("aimediart_docs.confirm_delete_section", { name: section.name }))) {
      return;
    }
    setSectionBusy(true);
    const { error } = await deleteGedSection(section);
    setSectionBusy(false);
    if (error) {
      toast.error(t("aimediart_docs.error_section_delete", { detail: error }));
      return;
    }
    toast.success(t("aimediart_docs.section_deleted"));
    setSections((prev) => prev.filter((s) => s.id !== section.id));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!hideTitle ? (
          <h2 className="font-serif text-base font-bold tracking-tight text-foreground md:text-lg">
            {t("aimediart_docs.panel_title")}
          </h2>
        ) : (
          <span className="sr-only">{t("aimediart_docs.panel_title")}</span>
        )}
        {!openSectionSlug && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7"
            disabled={sectionBusy}
            onClick={() => void handleCreateSection()}
          >
            <FolderPlus />
            {t("aimediart_docs.btn_new_section")}
          </Button>
        )}
      </div>

      {sectionsLoading ? (
        <p className="py-1 text-sm text-muted-foreground">{t("aimediart_docs.loading")}</p>
      ) : sections.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 py-3 text-center text-sm text-muted-foreground">
          {t("aimediart_docs.empty_sections")}
        </p>
      ) : (
        (() => {
          const [sectionsLeft, sectionsRight] = splitTwoColumns(sections);
          const sectionOpen = (slug: string) => openSectionSlug === slug;
          const showSectionActions = (slug: string) =>
            sectionOpen(slug) && !nestedFolderOpen;

          const handleSectionAccordionChange = (value: string) => {
            setOpenSectionSlug(value);
            if (!value) setNestedFolderOpen(false);
          };

          const renderSection = (section: AimediartGedSection) => {
            const open = sectionOpen(section.slug);
            const actionsVisible = showSectionActions(section.slug);
            return (
            <AccordionItem
              key={section.id}
              value={section.slug}
              className="border-border/50"
            >
              <div className="relative flex w-full min-h-8 items-center">
                {renamingSectionId === section.id ? (
                  <div
                    className="flex flex-1 items-center gap-1.5 px-1 py-1"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <Input
                      ref={sectionRenameRef}
                      value={sectionRenameValue}
                      onChange={(e) => setSectionRenameValue(e.target.value)}
                      className="h-7 font-serif text-sm font-bold"
                      aria-label={t("aimediart_docs.rename_folder")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void submitRenameSection(section);
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelRenameSection();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      disabled={sectionBusy}
                      title={t("aimediart_docs.rename_folder")}
                      onClick={() => void submitRenameSection(section)}
                    >
                      {sectionBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      disabled={sectionBusy}
                      onClick={cancelRenameSection}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <AccordionTrigger className="w-full px-1 py-1.5 hover:no-underline [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0">
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-left font-serif text-sm font-bold leading-tight",
                          actionsVisible ? "pr-24" : "pr-8",
                        )}
                      >
                        {section.name}{" "}
                        <span className="font-sans font-normal text-muted-foreground">
                          ({sectionDocCounts[section.slug] ?? 0})
                        </span>
                      </span>
                    </AccordionTrigger>
                    {actionsVisible && (
                      <div className="pointer-events-none absolute inset-y-0 right-7 z-10 flex items-center gap-0.5">
                        <div className="pointer-events-auto flex items-center gap-0.5 rounded-md bg-background/90">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            disabled={!section.share_token}
                            title={t("aimediart_docs.share_section")}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              void copySectionShare(section);
                            }}
                          >
                            <Link2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            disabled={sectionBusy}
                            title={t("aimediart_docs.rename_folder")}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              startRenameSection(section);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                            disabled={sectionBusy}
                            title={t("aimediart_docs.delete_section")}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteSection(section);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              <AccordionContent className="px-1 pb-2">
                {open && (
                  <DocumentManager
                    category={section.slug}
                    onDocsCountChange={(count) => setSectionCount(section.slug, count)}
                    onNestedOpenChange={setNestedFolderOpen}
                  />
                )}
              </AccordionContent>
            </AccordionItem>
            );
          };
          if (!isLgUp) {
            return (
              <SingleBlock>
                <Accordion
                  type="single"
                  collapsible
                  className="w-full"
                  value={openSectionSlug}
                  onValueChange={handleSectionAccordionChange}
                >
                  {sections.map(renderSection)}
                </Accordion>
              </SingleBlock>
            );
          }
          return (
            <TwoColumnBlocks
              left={
                <Accordion
                  type="single"
                  collapsible
                  className="w-full"
                  value={openSectionSlug}
                  onValueChange={handleSectionAccordionChange}
                >
                  {sectionsLeft.map(renderSection)}
                </Accordion>
              }
              right={
                <Accordion
                  type="single"
                  collapsible
                  className="w-full"
                  value={openSectionSlug}
                  onValueChange={handleSectionAccordionChange}
                >
                  {sectionsRight.map(renderSection)}
                </Accordion>
              }
            />
          );
        })()
      )}
    </div>
  );
}

export default AimediartDocumentsPanel;
