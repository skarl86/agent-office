import { useEffect } from "react";
import { X } from "lucide-react";
import { useToastStore } from "@/store/toast-store";

const TOAST_COLORS = {
  info: "bg-blue-500",
  success: "bg-green-500",
  warning: "bg-yellow-500",
  error: "bg-red-500",
} as const;

export function ToastContainer() {
  const items = useToastStore((s) => s.items);
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <div className="pointer-events-none fixed right-4 top-14 z-50 flex flex-col gap-2">
      {items.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          message={toast.message}
          type={toast.type}
          onDismiss={removeToast}
        />
      ))}
    </div>
  );
}

function ToastItem({
  id,
  message,
  type,
  onDismiss,
}: {
  id: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), 5000);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm text-white shadow-lg ${TOAST_COLORS[type]}`}
    >
      <span className="flex-1">{message}</span>
      <button onClick={() => onDismiss(id)} className="opacity-70 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}
