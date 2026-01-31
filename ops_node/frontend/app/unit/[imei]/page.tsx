"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Settings, Terminal, Clock, Loader2, X, Copy, MessageSquare, RefreshCw, Cpu } from "lucide-react";
import { getUnit, getUnitSettings, getUnitCommands, getCommandHistory, sendCommand, Unit, UnitConfig, CommandHistory } from "@/lib/api";
import { cn } from "@/lib/utils";
import CopyUnitConfig from "@/components/CopyUnitConfig";
import ManualCommandModal from "@/components/ManualCommandModal";
import { ToastContainer, useToast } from "@/components/Toast";
import { TabType } from "./types";
import SettingsTab from "./SettingsTab";
import CommandsTab from "./CommandsTab";
import HistoryTab from "./HistoryTab";
import UnitIOMappingTab from "./UnitIOMappingsTab";

export default function UnitPage() {
  const params = useParams();
  const router = useRouter();
  const imei = params.imei as string;

  const [unit, setUnit] = useState<Unit | null>(null);
  const [settings, setSettings] = useState<UnitConfig[]>([]);
  const [commands, setCommands] = useState<UnitConfig[]>([]);
  const [history, setHistory] = useState<CommandHistory[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>("settings");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  // Copy config modal
  const [showCopyConfig, setShowCopyConfig] = useState(false);
  // Manual command modal
  const [showManualCommand, setShowManualCommand] = useState(false);
  
  // Toast notifications
  const { toasts, dismissToast, showCommandSent, showCommandResult, addToast } = useToast();
  
  // Track pending commands for status polling
  const pendingCommandsRef = useRef<Map<number, { 
    configId: number; 
    commandName: string; 
    commandText?: string;  // Store actual command text from response
    method: "sms" | "gprs"; 
    sentAt: number;
    notified: boolean;  // Track if we've already shown notification
  }>>(new Map());
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [pollingTrigger, setPollingTrigger] = useState(0); // Trigger to start polling
  const lastHistoryCheckRef = useRef<number>(0);  // Track last history length to detect changes

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [unitData, settingsData, commandsData] = await Promise.all([
        getUnit(imei),
        getUnitSettings(imei),
        getUnitCommands(imei),
      ]);
      setUnit(unitData);
      setSettings(settingsData);
      setCommands(commandsData);
    } catch (err: any) {
      setError(err.message || "Failed to load unit");
    } finally {
      setLoading(false);
    }
  };

  // Check history for completed commands and notify
  const checkForCommandResults = useCallback((historyData: CommandHistory[]) => {
    const pendingCommands = pendingCommandsRef.current;
    
    // Sort history by time descending (newest first)
    const sortedHistory = [...historyData].sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });
    
    pendingCommands.forEach((pending, id) => {
      // Skip if already notified
      if (pending.notified) return;
      
      const sentTime = pending.sentAt;
      const timeWindow = 5 * 60 * 1000; // 5 minute window
      
      // Find outgoing command that matches our timing (within 10 seconds of when we sent)
      const matchingOutgoing = sortedHistory.find(h =>
        h.direction === "outgoing" &&
        h.send_method === pending.method &&
        h.created_at &&
        Math.abs(new Date(h.created_at).getTime() - sentTime) < 10000 // Within 10 seconds
      );
      
      // If we found the outgoing command, save its text for better matching
      if (matchingOutgoing && !pending.commandText) {
        pending.commandText = matchingOutgoing.command_text;
      }
      
      // Find response (incoming message that came after our sent command)
      const matchingResponse = sortedHistory.find(h => {
        if (h.direction !== "incoming") return false;
        if (!h.created_at) return false;
        
        const responseTime = new Date(h.created_at).getTime();
        const timeDiff = responseTime - sentTime;
        
        // Response should come after sent but within time window
        return timeDiff > 0 && timeDiff < timeWindow;
      });
      
      // Check the status of our outgoing command
      const hasFinalStatus = matchingOutgoing && 
        matchingOutgoing.status && 
        ["successful", "failed", "no_reply", "received"].includes(matchingOutgoing.status);
      
      // Show notification if we got a response OR the outgoing status is final
      if (matchingResponse) {
        pending.notified = true;
        showCommandResult(
          pending.commandName,
          matchingResponse.command_text,
          "successful",
          pending.method,
          imei
        );
        // Keep in map briefly so we don't re-notify, then remove
        setTimeout(() => pendingCommands.delete(id), 5000);
      } else if (hasFinalStatus && matchingOutgoing.status !== "sent" && matchingOutgoing.status !== "pending") {
        pending.notified = true;
        showCommandResult(
          pending.commandName,
          null,
          matchingOutgoing.status || "unknown",
          pending.method,
          imei
        );
        setTimeout(() => pendingCommands.delete(id), 5000);
      }
      
      // Remove old pending commands (older than 5 minutes) without notification
      if (Date.now() - sentTime > timeWindow) {
        // If not notified yet and timed out, show no_reply
        if (!pending.notified) {
          pending.notified = true;
          showCommandResult(
            pending.commandName,
            null,
            "no_reply",
            pending.method,
            imei
          );
        }
        setTimeout(() => pendingCommands.delete(id), 2000);
      }
    });
  }, [imei, showCommandResult]);

  // Load history with loading state
  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const data = await getCommandHistory(imei, 50);
      const sortedData = data.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });
      setHistory(sortedData);
      
      // Check for completed commands and show notifications
      checkForCommandResults(sortedData);
    } catch (err: any) {
      console.error("Failed to load history:", err);
      addToast({
        type: "error",
        title: "Failed to Load History",
        message: err?.message || "Could not load command history. Please try again.",
        duration: 6000,
      });
    } finally {
      setHistoryLoading(false);
    }
  }, [imei, addToast, checkForCommandResults]);

  useEffect(() => { loadData(); }, [imei]);

  useEffect(() => {
    if (activeTab === "history") {
      loadHistory();
    }
  }, [activeTab, imei, loadHistory]);
  
  // Set up polling for command status when there are pending commands
  useEffect(() => {
    // Clear any existing interval first
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    
    const hasPendingCommands = pendingCommandsRef.current.size > 0;
    const hasUnnotifiedCommands = Array.from(pendingCommandsRef.current.values()).some(p => !p.notified);
    
    if (hasPendingCommands && hasUnnotifiedCommands) {
      // Start polling immediately for faster GPRS response detection
      loadHistory();
      
      // Check if any pending commands are GPRS (they respond faster)
      const hasGprsCommands = Array.from(pendingCommandsRef.current.values()).some(p => p.method === "gprs" && !p.notified);
      const pollInterval = hasGprsCommands ? 1500 : 2500; // Faster polling for GPRS
      
      pollingIntervalRef.current = setInterval(() => {
        const stillHasPending = pendingCommandsRef.current.size > 0;
        const stillHasUnnotified = Array.from(pendingCommandsRef.current.values()).some(p => !p.notified);
        
        if (stillHasPending && stillHasUnnotified) {
          loadHistory();
        } else {
          // All commands notified, stop polling
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }
      }, pollInterval);
    }
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [loadHistory, pollingTrigger]);

  const handleSendCommand = async (configId: number, value?: string, sendMethod?: "sms" | "gprs"): Promise<boolean> => {
    const method = sendMethod || "sms";
    
    // Find the command config to get the command name
    const config = [...settings, ...commands].find(c => c.id === configId);
    const commandName = config?.command_name || `Command #${configId}`;
    
    try {
      // Show "command sent" notification
      showCommandSent(commandName, method, imei);
      
      const result = await sendCommand(imei, { 
        config_id: configId, 
        value, 
        user_id: "admin", 
        save_value: true,
        send_method: method
      });
      
      if (result.success) {
        // Track this command for status polling
        const trackingId = Date.now();
        pendingCommandsRef.current.set(trackingId, {
          configId,
          commandName,
          commandText: result.command_text,  // Store actual command text if available
          method,
          sentAt: Date.now(),
          notified: false
        });
        
        // Trigger polling effect to start immediately
        setPollingTrigger(prev => prev + 1);
        
        return true;
      } else {
        addToast({
          type: "error",
          title: "Command Failed",
          message: result.message || "Failed to send command",
          duration: 6000,
        });
        return false;
      }
    } catch (err: any) {
      console.error("Failed to send command:", err);
      const errorMessage = err?.message || err?.toString() || "An unexpected error occurred";
      addToast({
        type: "error",
        title: "Command Error",
        message: errorMessage,
        duration: 6000,
      });
      return false;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-12 h-12 animate-spin text-primary-500" />
      </div>
    );
  }

  if (error || !unit) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <X className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Error</h2>
          <p className="text-slate-500 mb-6">{error || "Unit not found"}</p>
          <button onClick={() => router.push("/")} className="px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl transition-all shadow-sm">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-4 sm:mb-6">
        <button onClick={() => router.push("/")} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-3 sm:mb-4 transition-colors text-sm">
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          Back to Search
        </button>

        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-1">{unit.device_name}</h1>
              <p className="text-slate-400 font-mono text-sm sm:text-base">{unit.imei}</p>
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
              <button onClick={() => setShowManualCommand(true)} className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg text-white transition-all text-sm">
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Manual Command</span>
              </button>
              <button onClick={() => setShowCopyConfig(true)} className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg text-white transition-all text-sm">
                <Copy className="w-4 h-4" />
                <span className="hidden sm:inline">Copy Config</span>
              </button>
              <div className="flex flex-wrap gap-2 sm:gap-3 text-xs sm:text-sm">
                <div className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-white/5 backdrop-blur-sm rounded-lg">
                  <span className="text-slate-400">SIM:</span> <span className="text-white font-mono">{unit.sim_no || "N/A"}</span>
                </div>
                {unit.mega_id && (
                  <div className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-white/5 backdrop-blur-sm rounded-lg">
                    <span className="text-slate-400">MegaID:</span> <span className="text-white font-mono">{unit.mega_id}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto mb-4">
        <div className="flex gap-1 sm:gap-2 p-1 bg-white rounded-xl border border-slate-200 shadow-sm w-full sm:w-fit overflow-x-auto">
          {[
            { id: "settings", label: "Settings", icon: Settings, count: settings.length },
            { id: "commands", label: "Commands", icon: Terminal, count: commands.length },
            { id: "unit-io-mapping", label: "IO Mappings", icon: Cpu, count: null },
            { id: "history", label: "History", icon: Clock, count: null },
          ].map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as TabType)}
              className={cn(
                "flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-medium transition-all text-xs sm:text-sm flex-1 sm:flex-none whitespace-nowrap border-b-2",
                activeTab === id 
                  ? "text-primary-600 border-primary-600 bg-primary-50" 
                  : "text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50"
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
              {count !== null && (
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded", activeTab === id ? "bg-primary-100 text-primary-700" : "bg-slate-200 text-slate-600")}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto">
        {activeTab === "settings" && (
          <SettingsTab
            unit={unit}
            configs={settings}
            onSendCommand={handleSendCommand}
          />
        )}

        {activeTab === "commands" && (
          <CommandsTab
            unit={unit}
            configs={commands}
            onSendCommand={handleSendCommand}
          />
        )}

        {activeTab === "unit-io-mapping" && (
          <UnitIOMappingTab unit={unit} />
        )}

        {activeTab === "history" && (
          <div className="space-y-4">
            {/* History Controls */}
            <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Clock className="w-4 h-4" />
                <span>Command History</span>
                {history.length > 0 && (
                  <span className="text-slate-400">({history.length} records)</span>
                )}
              </div>
              <button
                onClick={loadHistory}
                disabled={historyLoading}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn("w-4 h-4", historyLoading && "animate-spin")} />
                Refresh
              </button>
            </div>
            <HistoryTab history={history} />
          </div>
        )}
      </div>
      
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      
      {/* Manual Command Modal */}
      {showManualCommand && (
        <ManualCommandModal
          imei={imei}
          simNo={unit?.sim_no || undefined}
          onClose={() => setShowManualCommand(false)}
          onSuccess={() => {
            // Optionally reload history
          }}
        />
      )}

      {/* Copy Config Modal */}
      {showCopyConfig && (
        <CopyUnitConfig
          sourceImei={imei}
          sourceDeviceName={unit?.device_name}
          onSuccess={() => { setShowCopyConfig(false); loadData(); }}
          onCancel={() => setShowCopyConfig(false)}
        />
      )}
    </div>
  );
}
