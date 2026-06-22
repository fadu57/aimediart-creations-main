import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type WorkflowTabId = "identite" | "analyse" | "mediations" | "audio" | "qrcode";

const WORKFLOW_TABS: { id: WorkflowTabId; label: string }[] = [
  { id: "identite", label: "Identité" },
  { id: "analyse", label: "Analyse" },
  { id: "mediations", label: "Médiations" },
  { id: "audio", label: "Audio" },
  { id: "qrcode", label: "QR-Code" },
];

type WorkflowClassicTabNavProps = {
  stepDone?: Partial<Record<WorkflowTabId, boolean>>;
};

/**
 * Onglets horizontaux type "folder tabs" — actif rouge site (#E63946), inactifs ambre.
 */
export function WorkflowClassicTabNav({ stepDone }: WorkflowClassicTabNavProps) {
  return (
    <div className="relative w-full">
      <TabsList
        className="relative z-10 flex h-auto w-full items-end gap-0.5 bg-transparent p-0"
        aria-label="Étapes du formulaire œuvre"
      >
        {WORKFLOW_TABS.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className={cn(
              "relative min-w-0 flex-1 rounded-none rounded-t-lg rounded-b-none border-0 border-none border-transparent px-1 py-0 shadow-none outline-none ring-0 ring-offset-0",
              "text-[9px] font-bold uppercase leading-tight tracking-wide sm:text-[10px] md:text-[11px]",
              "focus-visible:ring-2 focus-visible:ring-[#E63946]/50",
              /* Inactif : ambre clair, légèrement en retrait */
              "mb-0.5 pb-2 pt-2",
              "data-[state=inactive]:bg-gradient-to-b data-[state=inactive]:from-[#faf6f0] data-[state=inactive]:to-[#ebe3d6]",
              "data-[state=inactive]:text-amber-900/55",
              "data-[state=inactive]:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(0,0,0,0.06)]",
              "data-[state=inactive]:hover:from-[#fff9f2] data-[state=inactive]:hover:to-[#f0e8dc] data-[state=inactive]:hover:text-amber-900/75",
              /* Actif : rouge glossy, rejoint la barre */
              "data-[state=active]:z-20 data-[state=active]:mb-0 data-[state=active]:pb-2.5 data-[state=active]:pt-2.5",
              "data-[state=active]:bg-[linear-gradient(180deg,#ff7a84_27%,#e63946_100%)]",
              "data-[state=active]:text-white",
              "data-[state=active]:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_2px_6px_rgba(230,57,70,0.35)]",
            )}
          >
            <span className="block truncate">{tab.label}</span>
            {stepDone?.[tab.id] ? (
              <span
                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-white"
                aria-hidden
              />
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {/* Barre de base continue sous les onglets */}
      <div
        className="h-2.5 w-full rounded-b-md bg-[linear-gradient(180deg,#e63946_100%,#e63946_100%)] shadow-[0_2px_4px_rgba(201,47,59,0.25)]"
        aria-hidden
      />
    </div>
  );
}
