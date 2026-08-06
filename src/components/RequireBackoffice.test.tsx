import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { RequireBackoffice } from "@/components/RequireBackoffice";

const useEffectiveAuthMock = vi.fn();

vi.mock("@/hooks/useEffectiveAuth", () => ({
  useEffectiveAuth: () => useEffectiveAuthMock(),
}));

vi.mock("@/lib/authUser", () => ({
  isVisitorRole: () => false,
}));

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/settings/qui-est-en-ligne"]}>
      <Routes>
        <Route element={<RequireBackoffice />}>
          <Route path="/settings/qui-est-en-ligne" element={<div>page-online</div>} />
        </Route>
        <Route path="/login" element={<div>page-login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequireBackoffice — loading vs session", () => {
  it("affiche le spinner uniquement au boot sans session", () => {
    useEffectiveAuthMock.mockReturnValue({
      session: null,
      loading: true,
      role_name: null,
      role_id: null,
      expo_id: null,
    });
    renderGuard();
    expect(screen.getByText(/Verification de la session/i)).toBeInTheDocument();
    expect(screen.queryByText("page-online")).not.toBeInTheDocument();
  });

  it("ne démonte pas l'Outlet si loading=true mais session déjà présente (token refresh)", () => {
    useEffectiveAuthMock.mockReturnValue({
      session: { user: { id: "u1" } },
      loading: true,
      role_name: "admin_general",
      role_id: 1,
      expo_id: null,
    });
    renderGuard();
    expect(screen.getByText("page-online")).toBeInTheDocument();
    expect(screen.queryByText(/Verification de la session/i)).not.toBeInTheDocument();
  });

  it("redirige vers /login si pas de session une fois le loading terminé", () => {
    useEffectiveAuthMock.mockReturnValue({
      session: null,
      loading: false,
      role_name: null,
      role_id: null,
      expo_id: null,
    });
    renderGuard();
    expect(screen.getByText("page-login")).toBeInTheDocument();
  });
});
