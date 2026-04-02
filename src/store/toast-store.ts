import { create } from "zustand";
import { uuid } from "@/lib/uuid";

export type ToastType = "info" | "success" | "error" | "warning";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  createdAt: number;
}

interface ToastStore {
  items: ToastItem[];
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  items: [],
  addToast: (message, type = "info") => {
    const item: ToastItem = {
      id: uuid(),
      message,
      type,
      createdAt: Date.now(),
    };
    set((state) => ({ items: [...state.items, item] }));
    // Auto-remove after 5 seconds
    setTimeout(() => {
      set((state) => ({ items: state.items.filter((t) => t.id !== item.id) }));
    }, 5000);
  },
  removeToast: (id) => {
    set((state) => ({ items: state.items.filter((t) => t.id !== id) }));
  },
}));
