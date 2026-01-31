"use client";

import { useState, useMemo } from "react";
import { Send, Loader2, Check, Terminal } from "lucide-react";
import { UnitConfig } from "@/lib/api";
import { cn } from "@/lib/utils";
import { buildCommandText } from "@/lib/command-builder";

interface CommandCardProps {
  command: UnitConfig;
  onSend: (configId: number, value?: string, sendMethod?: "sms" | "gprs") => Promise<boolean>;
}

export default function CommandCard({ command, onSend }: CommandCardProps) {
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sendMethod, setSendMethod] = useState<"sms" | "gprs">("sms");

  // Build command preview from separator + parameters
  const commandPreview = useMemo(() => {
    return buildCommandText(
      {
        command_seprator: command.command_seprator,
        command_parameters_json: command.command_parameters_json,
        command_syntax: command.command_syntax,
        command_name: command.command_name,
      },
      undefined // No value for command preview
    );
  }, [command]);

  const handleSend = async () => {
    if (!command.id) return;
    
    setSending(true);
    setSuccess(false);

    const result = await onSend(command.id, undefined, sendMethod);

    setSending(false);
    if (result) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  return (
    <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-slate-200 hover:border-accent-300 transition-all group shadow-sm hover:shadow-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-start sm:items-center gap-3 sm:gap-4 flex-1 min-w-0">
          <div className="p-2.5 sm:p-3 bg-accent-50 rounded-lg sm:rounded-xl group-hover:bg-accent-100 transition-colors shrink-0">
            <Terminal className="w-4 h-4 sm:w-5 sm:h-5 text-accent-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-slate-800 text-sm sm:text-base">
                {command.command_name}
              </h3>
            </div>
            {/* Description shown below command name */}
            {command.description && (
              <p className="text-xs sm:text-sm text-slate-500 mt-1 mb-2">
                {command.description}
              </p>
            )}
            {/* CommandSyntax if available (from old frontend: command.commandSyntax || command.commandName) */}
            {command.command_syntax && (
              <code className="text-xs text-slate-600 font-mono block mb-2 bg-slate-100 px-2 py-1 rounded">
                {command.command_syntax}
              </code>
            )}
            {/* Command preview (built from parameters) */}
            {commandPreview && (
              <code className="text-xs sm:text-sm text-slate-500 font-mono block truncate">
                {commandPreview}
              </code>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* SMS/GPRS Toggle */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setSendMethod("sms")}
              className={cn(
                "px-2 py-1 text-xs font-medium rounded-md transition-all",
                sendMethod === "sms"
                  ? "bg-white text-slate-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              SMS
            </button>
            <button
              onClick={() => setSendMethod("gprs")}
              className={cn(
                "px-2 py-1 text-xs font-medium rounded-md transition-all",
                sendMethod === "gprs"
                  ? "bg-white text-slate-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              GPRS
            </button>
          </div>

          <button
            onClick={handleSend}
            disabled={sending}
            className={cn(
              "px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-medium flex items-center justify-center gap-2 transition-all shrink-0 text-sm",
              success
                ? "bg-green-500 text-white"
                : "bg-accent-500 hover:bg-accent-600 text-white shadow-md",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : success ? (
              <Check className="w-4 h-4" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {success ? "Sent!" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
