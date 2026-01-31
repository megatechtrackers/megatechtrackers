"use client";

import { useState } from "react";
import { X, Send, Loader2 } from "lucide-react";
import { sendCommand } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ManualCommandModalProps {
  imei: string;
  simNo?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ManualCommandModal({
  imei,
  simNo,
  onClose,
  onSuccess,
}: ManualCommandModalProps) {
  const [commandText, setCommandText] = useState("");
  const [sendMethod, setSendMethod] = useState<"sms" | "gprs">("sms");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSend = async () => {
    if (!commandText.trim()) {
      setError("Please enter a command");
      return;
    }

    setSending(true);
    setError(null);

    try {
      const result = await sendCommand(imei, {
        command_text: commandText,
        send_method: sendMethod,
        user_id: "manual",
        save_value: false,
      });

      if (result.success) {
        setSuccess(true);
        setCommandText("");
        onSuccess?.();
        setTimeout(() => {
          setSuccess(false);
        }, 2000);
      } else {
        setError(result.message || "Failed to send command");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send command");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">
            Send Manual Command
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Unit Info */}
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">IMEI:</span>
              <span className="font-mono text-slate-700">{imei}</span>
            </div>
            {simNo && (
              <div className="flex justify-between mt-1">
                <span className="text-slate-500">SIM:</span>
                <span className="font-mono text-slate-700">{simNo}</span>
              </div>
            )}
          </div>

          {/* Send Method Toggle */}
          <div>
            <label className="text-sm font-medium text-slate-600 block mb-2">
              Send Method
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setSendMethod("sms")}
                className={cn(
                  "flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all",
                  sendMethod === "sms"
                    ? "bg-blue-500 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                SMS
              </button>
              <button
                onClick={() => setSendMethod("gprs")}
                className={cn(
                  "flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all",
                  sendMethod === "gprs"
                    ? "bg-blue-500 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                GPRS
              </button>
            </div>
          </div>

          {/* Command Input */}
          <div>
            <label className="text-sm font-medium text-slate-600 block mb-2">
              Command Text
            </label>
            <textarea
              value={commandText}
              onChange={(e) => setCommandText(e.target.value)}
              placeholder="Enter command to send..."
              rows={3}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-400 resize-none"
            />
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              Command sent successfully!
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-slate-200">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !commandText.trim()}
            className={cn(
              "flex-1 py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all",
              "bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send via {sendMethod.toUpperCase()}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
