import { useContext } from "react";

import {
  NavigationMatrixContext,
  type NavigationMatrixContextValue,
} from "@/providers/navigationMatrixContext";

export function useNavigationMatrix(): NavigationMatrixContextValue {
  const ctx = useContext(NavigationMatrixContext);
  if (!ctx) {
    throw new Error("useNavigationMatrix doit être utilisé sous NavigationMatrixProvider");
  }
  return ctx;
}
