"use client";

import { useState, useCallback, useMemo } from "react";
import { Send, Loader2, Check, ChevronDown, ChevronUp } from "lucide-react";
import { UnitConfig, ConfigParameter, SubDetail } from "@/lib/api";
import { cn } from "@/lib/utils";
import { buildCommandText } from "@/lib/command-builder";
import ScheduleControl from "./ScheduleControl";
import ZoneControl from "./ZoneControl";
import OperatorControl from "./OperatorControl";
import ATFenceControl from "./ATFenceControl";

interface SettingCardProps {
  setting: UnitConfig;
  onSendCommand: (configId: number, value?: string, sendMethod?: "sms" | "gprs") => Promise<boolean>;
  onValueChange?: (configId: number, value: string, hasChanged: boolean) => void;
}

/**
 * Extract UI metadata from parameters_json structure.
 * Format: [{"ParameterID": 123, "ParameterName": "...", "SubDetails": [{Control, ControlWidth, ...}]}]
 */
function extractUIMetadata(parametersJson: ConfigParameter[] | null | undefined) {
  if (!parametersJson || !Array.isArray(parametersJson) || parametersJson.length === 0) {
    return {
      control: "textbox",
      controlWidth: null,
      minValue: null,
      maxValue: null,
      description: null,
      options: null,
      defaultValue: null,
    };
  }

  const firstParam = parametersJson[0];
  const subDetails = firstParam?.SubDetails;
  
  if (!subDetails || !Array.isArray(subDetails) || subDetails.length === 0) {
    return {
      control: "textbox",
      controlWidth: null,
      minValue: null,
      maxValue: null,
      description: null,
      options: null,
      defaultValue: firstParam?.ParameterValue || null,
    };
  }

  const firstSubDetail = subDetails[0];
  const control = (firstSubDetail?.Control || "textbox").toLowerCase();

  // For ComboBox controls, all SubDetails become options
  // Original uses: optionValue = actualValue || cmdValue, display = cmdText || optionValue
  let options: Array<{ label: string; value: string }> | null = null;
  if (["combobox"].includes(control)) {
    options = subDetails
      .filter((sd: SubDetail) => sd.ActualValue || sd.CmdValue)
      .map((sd: SubDetail) => {
        const optionValue = sd.ActualValue || sd.CmdValue || "";
        return {
          label: sd.CmdText || optionValue,
          value: optionValue,
        };
      });
    if (options.length === 0) options = null;
  }

  return {
    control,
    controlWidth: firstSubDetail?.ControlWidth || null,
    minValue: firstSubDetail?.MinValue || null,
    maxValue: firstSubDetail?.MaxValue || null,
    description: firstSubDetail?.Description || null,
    options,
    defaultValue: firstSubDetail?.ActualValue || firstParam?.ParameterValue || null,
  };
}

/**
 * Extract display value from a stored value item.
 * Handles: plain values, objects with Value property, nested structures
 */
function extractValueFromItem(item: any): string {
  if (item === null || item === undefined) return "";
  
  // If it's a primitive, return as string
  if (typeof item !== 'object') return String(item);
  
  // If it's an object with Value property (format: {"ParameterID": 123, "Value": "50"})
  if ('Value' in item) return String(item.Value ?? "");
  if ('value' in item) return String(item.value ?? "");
  
  // If it's an object with label/text (for options)
  if ('label' in item) return String(item.label ?? "");
  if ('text' in item) return String(item.text ?? "");
  if ('Text' in item) return String(item.Text ?? "");
  
  // Last resort: stringify (but this shouldn't happen with proper data)
  try {
    return JSON.stringify(item);
  } catch {
    return "[complex value]";
  }
}

/**
 * Parse the stored value (JSON array format) to extract display value(s).
 * Storage format: [{"ParameterID": 123, "Value": "val1"}] or ["val1"] or "val1"
 * Display format: "val1" or "val1,val2" (for multiple values)
 */
function parseStoredValue(storedValue: string | null | undefined | any, defaultValue: string | null | undefined): string {
  if (!storedValue) {
    return defaultValue ? extractValueFromItem(defaultValue) : "";
  }
  
  // If it's already an object or array, handle it directly
  if (typeof storedValue === 'object') {
    if (Array.isArray(storedValue)) {
      if (storedValue.length === 0) return defaultValue ? extractValueFromItem(defaultValue) : "";
      // Extract Value from each item and join
      const values = storedValue.map(extractValueFromItem).filter(v => v !== "");
      return values.length === 1 ? values[0] : values.join(",");
    }
    // Single object
    return extractValueFromItem(storedValue);
  }
  
  // If it's a string, try to parse as JSON
  if (typeof storedValue === 'string') {
    try {
      const parsed = JSON.parse(storedValue);
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) return defaultValue ? extractValueFromItem(defaultValue) : "";
        // Extract Value from each item and join
        const values = parsed.map(extractValueFromItem).filter(v => v !== "");
        return values.length === 1 ? values[0] : values.join(",");
      }
      // If it's an object, extract value
      if (typeof parsed === 'object' && parsed !== null) {
        return extractValueFromItem(parsed);
      }
      // If it's a scalar, use it directly
      return String(parsed);
    } catch {
      // Not valid JSON, use as plain string
      return storedValue;
    }
  }
  
  return String(storedValue);
}

export default function SettingCard({
  setting,
  onSendCommand,
  onValueChange,
}: SettingCardProps) {
  // Extract UI metadata from parameters_json
  const uiMetadata = useMemo(() => extractUIMetadata(setting.parameters_json), [setting.parameters_json]);
  
  // Parse stored JSON array to display value
  const initialValue = parseStoredValue(setting.current_value, uiMetadata.defaultValue);
  const [value, setValue] = useState(initialValue);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sendMethod, setSendMethod] = useState<"sms" | "gprs">("sms");

  // Build command preview from separator + parameters
  // ALWAYS show current value - this is exactly what will be sent
  const commandPreview = useMemo(() => {
    return buildCommandText(
      {
        command_seprator: setting.command_seprator,
        command_parameters_json: setting.command_parameters_json,
        command_syntax: setting.command_syntax,
        command_name: setting.command_name,
      },
      value || undefined,  // Always use current value from state
      undefined  // Don't fall back to saved value - show current input
    );
  }, [setting.command_seprator, setting.command_parameters_json, setting.command_syntax, setting.command_name, value]);

  const hasChanged = value !== initialValue;

  // Notify parent of value changes
  const handleValueChange = useCallback((newValue: string) => {
    setValue(newValue);
    const changed = newValue !== initialValue;
    onValueChange?.(setting.id, newValue, changed);
  }, [initialValue, onValueChange, setting.id]);

  const handleSend = async () => {
    // Don't send if value hasn't changed
    if (!hasChanged) {
      return;
    }

    setSending(true);
    setSuccess(false);

    const result = await onSendCommand(setting.id, value, sendMethod);

    setSending(false);
    if (result) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  // Use control type from parameters_json
  const controlType = uiMetadata.control;

  // Check if this is a special control that needs expanded view
  // Match original control names: "ScheduleControl", "ZoneControl", "ATFenceControl", "OperatorControl"
  const isSpecialControl = ["schedulecontrol", "zonecontrol", "atfencecontrol", "operatorcontrol"].includes(
    controlType
  );

  // Render input based on control type
  const renderInput = () => {
    switch (controlType) {
      case "schedulecontrol":
        return (
          <div className={cn("w-full", !expanded && "hidden")}>
            <ScheduleControl
              value={value}
              onChange={handleValueChange}
              description={setting.description || undefined}
            />
          </div>
        );

      case "zonecontrol":
        return (
          <div className={cn("w-full", !expanded && "hidden")}>
            <ZoneControl
              value={value}
              onChange={handleValueChange}
              description={setting.description || undefined}
            />
          </div>
        );

      case "atfencecontrol":
        return (
          <div className={cn("w-full", !expanded && "hidden")}>
            <ATFenceControl
              value={value}
              onChange={handleValueChange}
              description={setting.description || undefined}
            />
          </div>
        );

      case "operatorcontrol":
        return (
          <div className={cn("w-full", !expanded && "hidden")}>
            <OperatorControl
              value={value}
              onChange={handleValueChange}
              description={setting.description || undefined}
            />
          </div>
        );

      case "combobox":
        return (
          <select
            value={value}
            onChange={(e) => handleValueChange(e.target.value)}
            style={uiMetadata.controlWidth ? { width: `${uiMetadata.controlWidth}px` } : undefined}
            className="px-3 sm:px-4 py-2 sm:py-2.5 bg-white border border-slate-300 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 min-w-[140px] sm:min-w-[180px] text-slate-800"
          >
            {uiMetadata.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            )) || <option value="">No options</option>}
          </select>
        );

      case "numericupdown":
        // NumericUpDown - number input with min/max from database
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => handleValueChange(e.target.value)}
            min={uiMetadata.minValue ? parseFloat(uiMetadata.minValue) : undefined}
            max={uiMetadata.maxValue ? parseFloat(uiMetadata.maxValue) : undefined}
            style={uiMetadata.controlWidth ? { width: `${uiMetadata.controlWidth}px` } : undefined}
            className={cn(
              "px-3 sm:px-4 py-2 sm:py-2.5 bg-white border border-slate-300 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-center font-mono text-slate-800",
              !uiMetadata.controlWidth && "w-24 sm:w-32"
            )}
          />
        );

      case "command":
        // Command - direct command using CommandSyntax (read-only display, one-click send)
        return (
          <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-100 border border-slate-200 rounded-lg sm:rounded-xl text-slate-600 font-mono text-xs sm:text-sm">
            {setting.command_syntax || commandPreview || "No command"}
          </div>
        );

      case "textbox":
      default:
        // TextBox (default) - standard text input
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleValueChange(e.target.value)}
            style={uiMetadata.controlWidth ? { width: `${uiMetadata.controlWidth}px` } : undefined}
            className="flex-1 min-w-0 sm:min-w-[200px] px-3 sm:px-4 py-2 sm:py-2.5 bg-white border border-slate-300 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-slate-800"
          />
        );
    }
  };

  return (
    <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-slate-200 hover:border-slate-300 transition-all shadow-sm hover:shadow-md">
      <div className="flex flex-col gap-3 sm:gap-4">
        {/* Header Row */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 sm:gap-4">
          {/* Label & Description */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-slate-800 text-sm sm:text-base">{setting.command_name}</h3>
              {/* Expand button for special controls */}
              {isSpecialControl && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-800 transition-all"
                >
                  {expanded ? (
                    <>
                      <ChevronUp className="w-3 h-3" />
                      <span className="hidden sm:inline">Collapse</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3 h-3" />
                      <span className="hidden sm:inline">Expand</span>
                    </>
                  )}
                </button>
              )}
            </div>
            {/* Description shown below command name */}
            {(setting.description || uiMetadata.description) && (
              <p className="text-xs sm:text-sm text-slate-500 mt-1 mb-2">
                {setting.description || uiMetadata.description}
              </p>
            )}
            {commandPreview && controlType !== "readonly" && (
              <p className="text-xs text-slate-400 font-mono truncate">
                {commandPreview}
              </p>
            )}
          </div>

          {/* Input & Send Button */}
          <div className="flex items-center gap-2 sm:gap-3">
            {!isSpecialControl && renderInput()}

            {/* SMS/GPRS Toggle */}
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setSendMethod("sms")}
                type="button"
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
                type="button"
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

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={sending || !hasChanged || (!value && controlType !== "readonly")}
              className={cn(
                "px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-medium flex items-center gap-2 transition-all text-sm",
                success
                  ? "bg-green-500 text-white"
                  : hasChanged
                  ? "bg-primary-500 hover:bg-primary-600 text-white shadow-md"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200",
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
              <span className="hidden sm:inline">{success ? "Sent" : "Send"}</span>
            </button>
          </div>
        </div>

        {/* Special Control (expanded) */}
        {isSpecialControl && renderInput()}
      </div>
    </div>
  );
}
