import type { ComponentProps } from "react";

import { ArtworkModal } from "@/components/ArtworkModal";

type ArtworkModalWorkflowProps = Omit<ComponentProps<typeof ArtworkModal>, "experimentalWorkflow">;

/** Parcours guidé responsive (création et édition depuis le catalogue). */
export function ArtworkModalWorkflow(props: ArtworkModalWorkflowProps) {
  return <ArtworkModal {...props} experimentalWorkflow />;
}
