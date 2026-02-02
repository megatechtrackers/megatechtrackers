"use client";

import { useMemo, useState } from "react";
import { Clock, Send, ArrowDownLeft, Wifi, MessageSquare, User, Calendar, CheckCircle, XCircle, AlertCircle, Timer, Link2, ChevronDown, ChevronRight, Filter } from "lucide-react";
import { CommandHistory } from "@/lib/api";
import { cn, formatRelativeTime, formatDateTime } from "@/lib/utils";
import { useWorkingTimezone } from "@/lib/TimezoneContext";

interface HistoryTabProps {
  history: CommandHistory[];
}

// Grouped command pair (sent + response)
interface CommandPair {
  id: string;
  sent: CommandHistory;
  response: CommandHistory | null;
  isPaired: boolean;
}

// Status icon component
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "successful":
    case "received":
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-red-500" />;
    case "no_reply":
      return <AlertCircle className="w-4 h-4 text-amber-500" />;
    case "sent":
    case "pending":
      return <Timer className="w-4 h-4 text-blue-500" />;
    default:
      return <Clock className="w-4 h-4 text-slate-400" />;
  }
}

// Method badge component
function MethodBadge({ method }: { method?: string }) {
  if (!method) return null;
  
  const isGprs = method.toLowerCase() === "gprs";
  const Icon = isGprs ? Wifi : MessageSquare;
  
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide",
      isGprs 
        ? "bg-purple-100 text-purple-700 border border-purple-200" 
        : "bg-cyan-100 text-cyan-700 border border-cyan-200"
    )}>
      <Icon className="w-3 h-3" />
      {method}
    </span>
  );
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    successful: { bg: "bg-green-100", text: "text-green-700", label: "Success" },
    received: { bg: "bg-green-100", text: "text-green-700", label: "Received" },
    sent: { bg: "bg-blue-100", text: "text-blue-600", label: "Sent" },
    pending: { bg: "bg-blue-100", text: "text-blue-600", label: "Pending" },
    failed: { bg: "bg-red-100", text: "text-red-700", label: "Failed" },
    no_reply: { bg: "bg-amber-100", text: "text-amber-700", label: "No Reply" },
    cancelled: { bg: "bg-slate-100", text: "text-slate-600", label: "Cancelled" },
  };
  
  const config = statusConfig[status] || { bg: "bg-slate-100", text: "text-slate-600", label: status };
  
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
      config.bg,
      config.text
    )}>
      <StatusIcon status={status} />
      {config.label}
    </span>
  );
}

// Paired command card - shows sent command with its response grouped together
function PairedCommandCard({ pair, defaultExpanded = false }: { pair: CommandPair; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { workingTimezone } = useWorkingTimezone();
  const { sent, response, isPaired } = pair;
  
  // Determine overall status
  const overallStatus = response 
    ? (response.status || "received") 
    : (sent.status || "sent");
  
  const isSuccess = overallStatus === "successful" || overallStatus === "received";
  const isFailed = overallStatus === "failed";
  const isNoReply = overallStatus === "no_reply";
  const isPending = overallStatus === "sent" || overallStatus === "pending";
  
  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-all",
      isSuccess ? "bg-green-50/50 border-green-200" :
      isFailed ? "bg-red-50/50 border-red-200" :
      isNoReply ? "bg-amber-50/50 border-amber-200" :
      isPending ? "bg-blue-50/50 border-blue-200" :
      "bg-white border-slate-200"
    )}>
      {/* Header - Always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-black/5 transition-colors"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Status indicator */}
          <div className={cn(
            "w-2 h-2 rounded-full shrink-0",
            isSuccess ? "bg-green-500" :
            isFailed ? "bg-red-500" :
            isNoReply ? "bg-amber-500" :
            isPending ? "bg-blue-500 animate-pulse" :
            "bg-slate-400"
          )} />
          
          {/* Command preview */}
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-sm font-mono text-slate-700 truncate max-w-[300px]">
                {sent.command_text}
              </code>
              <MethodBadge method={sent.send_method ?? undefined} />
              {isPaired && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-medium">
                  <Link2 className="w-3 h-3" />
                  Paired
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
              <span>{sent.created_at ? formatRelativeTime(sent.created_at, workingTimezone) : 'Unknown'}</span>
              {sent.user_id && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {sent.user_id}
                  </span>
                </>
              )}
            </div>
          </div>
          
          {/* Status badge */}
          <StatusBadge status={overallStatus} />
          
          {/* Expand icon */}
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>
      
      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-200/50">
          {/* Sent Command */}
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600">
                <Send className="w-3.5 h-3.5" />
                Command Sent
              </div>
              <span className="text-[10px] text-slate-400">
                {sent.created_at ? formatDateTime(sent.created_at, workingTimezone) : 'Unknown'}
              </span>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-3">
              <code className="text-sm font-mono text-slate-800 break-all whitespace-pre-wrap">
                {sent.command_text}
              </code>
            </div>
          </div>
          
          {/* Response */}
          {response ? (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-green-600">
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  Response Received
                </div>
                <span className="text-[10px] text-slate-400">
                  {response.created_at ? formatDateTime(response.created_at, workingTimezone) : 'Unknown'}
                </span>
                {sent.created_at && response.created_at && (
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    {getTimeDiff(sent.created_at, response.created_at)}
                  </span>
                )}
              </div>
              <div className="bg-white rounded-lg border border-green-200 p-3">
                <code className="text-sm font-mono text-slate-800 break-all whitespace-pre-wrap">
                  {response.command_text}
                </code>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 py-3 text-sm text-slate-500 bg-slate-50 rounded-lg px-3">
              {isPending ? (
                <>
                  <Timer className="w-4 h-4 text-blue-500 animate-pulse" />
                  <span>Awaiting response...</span>
                </>
              ) : isNoReply ? (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <span>No response received</span>
                </>
              ) : isFailed ? (
                <>
                  <XCircle className="w-4 h-4 text-red-500" />
                  <span>Command delivery failed</span>
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span>No response</span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Standalone incoming message card
function IncomingMessageCard({ item }: { item: CommandHistory }) {
  const { workingTimezone } = useWorkingTimezone();
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <ArrowDownLeft className="w-3.5 h-3.5 text-slate-500" />
          Incoming Message
        </div>
        <MethodBadge method={item.send_method ?? undefined} />
        <span className="text-xs text-slate-400 ml-auto">
          {item.created_at ? formatRelativeTime(item.created_at, workingTimezone) : 'Unknown'}
        </span>
      </div>
      <div className="px-4 pb-4">
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
          <code className="text-sm font-mono text-slate-800 break-all whitespace-pre-wrap">
            {item.command_text}
          </code>
        </div>
        <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400">
          {item.created_at && (
            <span>{formatDateTime(item.created_at, workingTimezone)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper to calculate time difference
function getTimeDiff(start: string, end: string): string {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (diff < 1000) return `${diff}ms`;
  if (diff < 60000) return `${Math.round(diff / 1000)}s`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m`;
  return `${Math.round(diff / 3600000)}h`;
}

type ViewMode = 'grouped' | 'all';
type FilterMode = 'all' | 'success' | 'pending' | 'failed';

export default function HistoryTab({ history }: HistoryTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const { workingTimezone } = useWorkingTimezone();
  
  // Group outgoing commands with their responses
  const { pairs, standaloneIncoming } = useMemo(() => {
    const outgoing = history.filter(h => h.direction === "outgoing");
    const incoming = history.filter(h => h.direction === "incoming");
    
    // Track which incoming messages have been paired
    const pairedIncomingIds = new Set<number>();
    
    // Sort outgoing by time descending (newest first)
    const sortedOutgoing = [...outgoing].sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });
    
    // Match each outgoing command with a potential response
    const pairs: CommandPair[] = sortedOutgoing.map(sent => {
      const sentTime = sent.created_at ? new Date(sent.created_at).getTime() : 0;
      
      // Find the first incoming message after this command that hasn't been paired
      // Look within a 5-minute window
      const matchingResponse = incoming.find(inc => {
        if (pairedIncomingIds.has(inc.id)) return false;
        
        const incTime = inc.created_at ? new Date(inc.created_at).getTime() : 0;
        const timeDiff = incTime - sentTime;
        
        // Response should come after sent (within 5 minutes)
        return timeDiff > 0 && timeDiff < 5 * 60 * 1000;
      });
      
      if (matchingResponse) {
        pairedIncomingIds.add(matchingResponse.id);
      }
      
      return {
        id: `pair-${sent.id}`,
        sent,
        response: matchingResponse || null,
        isPaired: !!matchingResponse,
      };
    });
    
    // Find standalone incoming messages (not paired with any command)
    const standaloneIncoming = incoming
      .filter(inc => !pairedIncomingIds.has(inc.id))
      .sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeB - timeA;
      });
    
    return { pairs, standaloneIncoming };
  }, [history]);
  
  // Filter pairs based on filter mode
  const filteredPairs = useMemo(() => {
    if (filterMode === 'all') return pairs;
    
    return pairs.filter(pair => {
      const status = pair.response 
        ? (pair.response.status || "received") 
        : (pair.sent.status || "sent");
      
      switch (filterMode) {
        case 'success':
          return status === "successful" || status === "received";
        case 'pending':
          return status === "sent" || status === "pending";
        case 'failed':
          return status === "failed" || status === "no_reply";
        default:
          return true;
      }
    });
  }, [pairs, filterMode]);
  
  // Stats
  const stats = useMemo(() => ({
    total: pairs.length,
    paired: pairs.filter(p => p.isPaired).length,
    success: pairs.filter(p => {
      const status = p.response ? (p.response.status || "received") : (p.sent.status || "sent");
      return status === "successful" || status === "received";
    }).length,
    pending: pairs.filter(p => {
      const status = p.response ? (p.response.status || "received") : (p.sent.status || "sent");
      return status === "sent" || status === "pending";
    }).length,
    failed: pairs.filter(p => {
      const status = p.response ? (p.response.status || "received") : (p.sent.status || "sent");
      return status === "failed" || status === "no_reply";
    }).length,
  }), [pairs]);
  
  // Group by date (use working timezone for consistent display)
  const groupedByDate = useMemo(() => {
    const groups: Record<string, { pairs: CommandPair[]; standalone: CommandHistory[] }> = {};
    const dateOpts: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      ...(workingTimezone ? { timeZone: workingTimezone } : {}),
    };

    filteredPairs.forEach(pair => {
      const date = pair.sent.created_at
        ? new Date(pair.sent.created_at).toLocaleDateString('en-US', dateOpts)
        : 'Unknown Date';

      if (!groups[date]) groups[date] = { pairs: [], standalone: [] };
      groups[date].pairs.push(pair);
    });

    // Only show standalone incoming if not filtering
    if (filterMode === 'all') {
      standaloneIncoming.forEach(item => {
        const date = item.created_at
          ? new Date(item.created_at).toLocaleDateString('en-US', dateOpts)
          : 'Unknown Date';

        if (!groups[date]) groups[date] = { pairs: [], standalone: [] };
        groups[date].standalone.push(item);
      });
    }

    return groups;
  }, [filteredPairs, standaloneIncoming, filterMode, workingTimezone]);

  return (
    <div className="max-h-[calc(100vh-260px)] overflow-y-auto pr-1">
      {/* Stats Summary */}
      {history.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4 animate-in">
          <button 
            onClick={() => setFilterMode('all')}
            className={cn(
              "rounded-xl border p-3 text-center transition-all",
              filterMode === 'all' 
                ? "bg-slate-800 border-slate-700 ring-2 ring-slate-600" 
                : "bg-white border-slate-200 hover:bg-slate-50"
            )}
          >
            <div className={cn("text-2xl font-bold", filterMode === 'all' ? "text-white" : "text-slate-800")}>
              {stats.total}
            </div>
            <div className={cn("text-xs uppercase tracking-wide", filterMode === 'all' ? "text-slate-300" : "text-slate-500")}>
              Total
            </div>
          </button>
          <div className="bg-purple-50 rounded-xl border border-purple-200 p-3 text-center">
            <div className="text-2xl font-bold text-purple-600">{stats.paired}</div>
            <div className="text-xs text-purple-600 uppercase tracking-wide flex items-center justify-center gap-1">
              <Link2 className="w-3 h-3" />
              Paired
            </div>
          </div>
          <button 
            onClick={() => setFilterMode('success')}
            className={cn(
              "rounded-xl border p-3 text-center transition-all",
              filterMode === 'success' 
                ? "bg-green-600 border-green-500 ring-2 ring-green-400" 
                : "bg-green-50 border-green-200 hover:bg-green-100"
            )}
          >
            <div className={cn("text-2xl font-bold", filterMode === 'success' ? "text-white" : "text-green-600")}>
              {stats.success}
            </div>
            <div className={cn("text-xs uppercase tracking-wide", filterMode === 'success' ? "text-green-100" : "text-green-600")}>
              Success
            </div>
          </button>
          <button 
            onClick={() => setFilterMode('pending')}
            className={cn(
              "rounded-xl border p-3 text-center transition-all",
              filterMode === 'pending' 
                ? "bg-blue-600 border-blue-500 ring-2 ring-blue-400" 
                : "bg-blue-50 border-blue-200 hover:bg-blue-100"
            )}
          >
            <div className={cn("text-2xl font-bold", filterMode === 'pending' ? "text-white" : "text-blue-600")}>
              {stats.pending}
            </div>
            <div className={cn("text-xs uppercase tracking-wide", filterMode === 'pending' ? "text-blue-100" : "text-blue-600")}>
              Pending
            </div>
          </button>
          <button 
            onClick={() => setFilterMode('failed')}
            className={cn(
              "rounded-xl border p-3 text-center transition-all",
              filterMode === 'failed' 
                ? "bg-red-600 border-red-500 ring-2 ring-red-400" 
                : "bg-red-50 border-red-200 hover:bg-red-100"
            )}
          >
            <div className={cn("text-2xl font-bold", filterMode === 'failed' ? "text-white" : "text-red-600")}>
              {stats.failed}
            </div>
            <div className={cn("text-xs uppercase tracking-wide", filterMode === 'failed' ? "text-red-100" : "text-red-600")}>
              Failed
            </div>
          </button>
        </div>
      )}

      {/* Grouped History */}
      <div className="space-y-6 animate-in">
        {Object.entries(groupedByDate).map(([date, { pairs: datePairs, standalone }]) => (
          <div key={date}>
            {/* Date Header */}
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-600">{date}</h3>
              <div className="flex-1 h-px bg-slate-200"></div>
              <span className="text-xs text-slate-400">
                {datePairs.length} command{datePairs.length !== 1 ? 's' : ''}
                {standalone.length > 0 && `, ${standalone.length} incoming`}
              </span>
            </div>

            {/* Command Pairs */}
            <div className="space-y-3">
              {datePairs.map((pair) => (
                <PairedCommandCard 
                  key={pair.id} 
                  pair={pair} 
                  defaultExpanded={false}
                />
              ))}
              
              {/* Standalone Incoming Messages */}
              {standalone.map((item) => (
                <IncomingMessageCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}

        {/* Empty State */}
        {history.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
              <Clock className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 mb-2">No Command History</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              Commands sent to this device and their responses will appear here.
            </p>
          </div>
        )}
        
        {/* Filtered empty state */}
        {history.length > 0 && filteredPairs.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <Filter className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-700 mb-1">No matching commands</h3>
            <p className="text-sm text-slate-500">
              No commands match the current filter. 
              <button 
                onClick={() => setFilterMode('all')} 
                className="text-primary-600 hover:underline ml-1"
              >
                Show all
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
