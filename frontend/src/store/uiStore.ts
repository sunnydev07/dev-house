import { create } from "zustand";

export interface UiStoreState {
  theme: "dark" | "light";
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  activeSheetNodeId: string | null;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setActiveSheetNodeId: (id: string | null) => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  theme: "dark",
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  activeSheetNodeId: null,
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === "dark" ? "light" : "dark";
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-theme", next);
      }
      return { theme: next };
    }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setActiveSheetNodeId: (id) => set({ activeSheetNodeId: id }),
}));
