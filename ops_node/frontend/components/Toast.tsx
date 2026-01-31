"use client";

import { useEffect, useState, useCallback } from "react";
import { X, CheckCircle, XCircle, AlertCircle, Info, Wifi, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToastData {
  id: string;
  type: "success" | "error" | "warning" | "info" | "gprs" | "sms";
  title: string;
  message: string;
  duration?: number;
  details?: {
    imei?: string;
    command?: string;
    response?: string;
    method?: "sms" | "gprs";
    status?: string;
  };
}

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

function Toast({ toast, onDismiss }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const duration = toast.duration || 8000;
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, duration - 300);

    const removeTimer = setTimeout(() => {
      onDismiss(toast.id);
    }, duration);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, [toast.id, toast.duration, onDismiss]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  const icons = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertCircle,
    info: Info,
    gprs: Wifi,
    sms: MessageSquare,
  };

  const colors = {
    success: {
      bg: "bg-green-50 border-green-200",
      icon: "text-green-500",
      title: "text-green-800",
      text: "text-green-700",
      badge: "bg-green-100 text-green-700",
    },
    error: {
      bg: "bg-red-50 border-red-200",
      icon: "text-red-500",
      title: "text-red-800",
      text: "text-red-700",
      badge: "bg-red-100 text-red-700",
    },
    warning: {
      bg: "bg-amber-50 border-amber-200",
      icon: "text-amber-500",
      title: "text-amber-800",
      text: "text-amber-700",
      badge: "bg-amber-100 text-amber-700",
    },
    info: {
      bg: "bg-blue-50 border-blue-200",
      icon: "text-blue-500",
      title: "text-blue-800",
      text: "text-blue-700",
      badge: "bg-blue-100 text-blue-700",
    },
    gprs: {
      bg: "bg-purple-50 border-purple-200",
      icon: "text-purple-500",
      title: "text-purple-800",
      text: "text-purple-700",
      badge: "bg-purple-100 text-purple-700",
    },
    sms: {
      bg: "bg-cyan-50 border-cyan-200",
      icon: "text-cyan-500",
      title: "text-cyan-800",
      text: "text-cyan-700",
      badge: "bg-cyan-100 text-cyan-700",
    },
  };

  const Icon = icons[toast.type];
  const color = colors[toast.type];

  return (
    <div
      className={cn(
        "w-96 max-w-[calc(100vw-2rem)] rounded-xl border shadow-lg p-4 transition-all duration-300",
        color.bg,
        isExiting ? "opacity-0 translate-x-full" : "opacity-100 translate-x-0"
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("w-5 h-5 mt-0.5 shrink-0", color.icon)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h4 className={cn("font-semibold text-sm", color.title)}>{toast.title}</h4>
              {toast.details?.method && (
                <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded", color.badge)}>
                  {toast.details.method}
                </span>
              )}
            </div>
            <button
              onClick={handleDismiss}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className={cn("text-sm mt-1", color.text)}>{toast.message}</p>
          
          {/* Command Details */}
          {toast.details && (
            <div className="mt-3 space-y-2">
              {toast.details.command && (
                <div className="bg-white/50 rounded-lg p-2 border border-white/80">
                  <span className="text-[10px] font-medium text-slate-500 uppercase block mb-1">Command</span>
                  <code className="text-xs font-mono text-slate-700 break-all">{toast.details.command}</code>
                </div>
              )}
              {toast.details.response && (
                <div className="bg-white/50 rounded-lg p-2 border border-white/80">
                  <span className="text-[10px] font-medium text-slate-500 uppercase block mb-1">Response</span>
                  <code className="text-xs font-mono text-slate-700 break-all">{toast.details.response}</code>
                </div>
              )}
              {toast.details.status && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium text-slate-500 uppercase">Status:</span>
                  <span className={cn(
                    "text-xs font-medium px-2 py-0.5 rounded-full",
                    toast.details.status === "successful" ? "bg-green-100 text-green-700" :
                    toast.details.status === "failed" ? "bg-red-100 text-red-700" :
                    toast.details.status === "no_reply" ? "bg-amber-100 text-amber-700" :
                    "bg-slate-100 text-slate-700"
                  )}>
                    {toast.details.status}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

// Hook for managing toasts
export function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((toast: Omit<ToastData, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showCommandSent = useCallback((command: string, method: "sms" | "gprs", imei?: string) => {
    return addToast({
      type: method === "gprs" ? "gprs" : "sms",
      title: `Command Sent via ${method.toUpperCase()}`,
      message: `Awaiting response...`,
      duration: 5000,
      details: {
        command,
        method,
        imei,
      },
    });
  }, [addToast]);

  const showCommandResult = useCallback((
    command: string,
    response: string | null,
    status: string,
    method: "sms" | "gprs",
    imei?: string
  ) => {
    const isSuccess = status === "successful" || status === "received";
    const isFailed = status === "failed";
    const isNoReply = status === "no_reply";

    return addToast({
      type: isSuccess ? "success" : isFailed ? "error" : isNoReply ? "warning" : "info",
      title: isSuccess ? "Command Successful" : isFailed ? "Command Failed" : isNoReply ? "No Reply" : "Command Status",
      message: isSuccess
        ? "Device responded successfully"
        : isFailed
        ? "Command could not be delivered"
        : isNoReply
        ? "Device did not respond in time"
        : `Status: ${status}`,
      duration: 10000,
      details: {
        command,
        response: response || undefined,
        method,
        status,
        imei,
      },
    });
  }, [addToast]);

  return {
    toasts,
    addToast,
    dismissToast,
    showCommandSent,
    showCommandResult,
  };
}
