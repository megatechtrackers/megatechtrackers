'use client';

import { useState } from 'react';
import { copyUnitConfig, searchUnits, CopyUnitConfigRequest, CopyUnitConfigResponse } from '@/lib/api';
import { Unit } from '@/lib/api';
import { X, Search, Loader2, Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CopyUnitConfigProps {
  sourceImei: string;
  sourceDeviceName?: string;  // Device type to filter targets
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function CopyUnitConfig({ sourceImei, sourceDeviceName, onSuccess, onCancel }: CopyUnitConfigProps) {
  const [targetImeis, setTargetImeis] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Unit[]>([]);
  const [sendCommands, setSendCommands] = useState(false);
  const [sendMethod, setSendMethod] = useState<"sms" | "gprs">("sms");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CopyUnitConfigResponse | null>(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      // Pass device_name to filter by same device type
      const units = await searchUnits(searchQuery, sourceDeviceName, 20);
      // Also filter out the source unit from search results
      setSearchResults(units.filter(u => u.imei !== sourceImei));
    } catch (error) {
      console.error('Search failed:', error);
      alert('Search failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setSearching(false);
    }
  };

  const handleAddUnit = (imei: string) => {
    if (!targetImeis.includes(imei)) {
      setTargetImeis([...targetImeis, imei]);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleRemoveUnit = (imei: string) => {
    setTargetImeis(targetImeis.filter(i => i !== imei));
  };

  const handleSubmit = async () => {
    if (targetImeis.length === 0) {
      alert('Please select at least one target unit');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const request: CopyUnitConfigRequest = {
        source_imei: sourceImei,
        target_imeis: targetImeis,
        send_commands: sendCommands,
        send_method: sendMethod,
        user_id: '1', // TODO: Get from auth context
      };

      const response = await copyUnitConfig(request);
      setResult(response);
      // Don't auto-close - let user review results and close manually
    } catch (error) {
      console.error('Copy failed:', error);
      alert('Copy failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Copy Configuration
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Source: <span className="font-mono">{sourceImei}</span>
              {sourceDeviceName && (
                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                  {sourceDeviceName}
                </span>
              )}
            </p>
            {sourceDeviceName && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                Only units with device type &quot;{sourceDeviceName}&quot; will be shown
              </p>
            )}
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Result Message */}
          {result && (
            <div className={cn(
              "p-4 rounded-lg",
              result.success ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
            )}>
              <p className={cn("font-semibold", result.success ? 'text-green-800' : 'text-amber-800')}>
                {result.message}
              </p>
              <div className="mt-2 text-sm text-slate-600 grid grid-cols-2 gap-2">
                <p>Total configs: <span className="font-medium">{result.total_configs}</span></p>
                <p>Copied: <span className="font-medium text-green-700">{result.copied_configs}</span></p>
                <p>Skipped: <span className="font-medium text-amber-700">{result.skipped_configs}</span></p>
                {result.commands_sent > 0 && (
                  <p>Commands sent: <span className="font-medium text-blue-700">{result.commands_sent}</span></p>
                )}
              </div>
              {Object.keys(result.errors).length > 0 && (
                <div className="mt-3">
                  <p className="font-semibold text-red-800">Errors:</p>
                  <ul className="list-disc list-inside text-sm text-red-700 mt-1">
                    {Object.entries(result.errors).map(([imei, error]) => (
                      <li key={imei}><span className="font-mono">{imei}</span>: {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Search for target units */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Search for Target Units
            </label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search by IMEI, SIM, or MegaID..."
                  className="w-full px-3 py-2 pl-10 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-400"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
              <button
                onClick={handleSearch}
                disabled={searching}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm font-medium flex items-center gap-2 transition-colors"
              >
                {searching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Search"
                )}
              </button>
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="mt-2 border border-slate-200 rounded-lg max-h-40 overflow-y-auto bg-white">
                {searchResults.map((unit) => (
                  <div
                    key={unit.imei}
                    className="p-3 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-b-0 flex justify-between items-center"
                    onClick={() => handleAddUnit(unit.imei)}
                  >
                    <div>
                      <p className="font-mono text-sm text-slate-800">{unit.imei}</p>
                      <p className="text-xs text-slate-500">
                        {unit.device_name} {unit.sim_no && `• SIM: ${unit.sim_no}`}
                      </p>
                    </div>
                    <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">+ Add</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selected target units */}
          {targetImeis.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Target Units ({targetImeis.length})
              </label>
              <div className="border border-slate-200 rounded-lg p-2 max-h-32 overflow-y-auto bg-slate-50">
                {targetImeis.map((imei) => (
                  <div
                    key={imei}
                    className="flex justify-between items-center p-2 bg-white rounded-lg mb-1 last:mb-0 border border-slate-200"
                  >
                    <span className="font-mono text-sm text-slate-700">{imei}</span>
                    <button
                      onClick={() => handleRemoveUnit(imei)}
                      className="text-red-500 hover:text-red-700 text-xs font-medium"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Options */}
          <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sendCommands}
                onChange={(e) => setSendCommands(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">
                Send commands to target units after copying
              </span>
            </label>

            {/* Send Method Toggle - only show if sendCommands is enabled */}
            {sendCommands && (
              <div className="flex items-center gap-3 pl-7">
                <span className="text-sm text-slate-600">Via:</span>
                <div className="flex bg-slate-200 rounded-lg p-0.5">
                  <button
                    onClick={() => setSendMethod("sms")}
                    className={cn(
                      "px-3 py-1 text-xs font-medium rounded-md transition-all",
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
                      "px-3 py-1 text-xs font-medium rounded-md transition-all",
                      sendMethod === "gprs"
                        ? "bg-white text-slate-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    GPRS
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-slate-200">
          {result ? (
            // After copy completes, show Done button
            <button
              onClick={() => {
                onSuccess?.();
                onCancel?.();
              }}
              className="flex-1 py-2 px-4 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm font-medium transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              {onCancel && (
                <button
                  onClick={onCancel}
                  disabled={loading}
                  className="flex-1 py-2 px-4 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-50 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={loading || targetImeis.length === 0}
                className={cn(
                  "flex-1 py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors",
                  "bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Copying...
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy Configuration
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
