'use client';

import { Edit, Trash2 } from 'lucide-react';
import { DeviceConfig, ConfigParameter, SubDetail } from '@/lib/api';

interface ConfigItemProps {
  config: DeviceConfig;
  onEdit: (config: DeviceConfig) => void;
  onDelete: (config: DeviceConfig) => void;
}

// Extract UI metadata from parameters_json (same logic as SettingCard)
function extractUIMetadata(parametersJson: ConfigParameter[] | null | undefined) {
  if (!parametersJson || !Array.isArray(parametersJson) || parametersJson.length === 0) {
    return {
      control: null,
      defaultValue: null,
      minValue: null,
      maxValue: null,
      paramCount: 0,
      subDetailCount: 0,
    };
  }

  const firstParam = parametersJson[0];
  const subDetails = firstParam?.SubDetails;
  const firstSubDetail = subDetails && subDetails.length > 0 ? subDetails[0] : null;

  return {
    control: firstSubDetail?.Control || null,
    defaultValue: firstParam?.ParameterValue || firstSubDetail?.ActualValue || null,
    minValue: firstSubDetail?.MinValue || null,
    maxValue: firstSubDetail?.MaxValue || null,
    paramCount: parametersJson.length,
    subDetailCount: subDetails?.length || 0,
  };
}

export default function ConfigItem({ config, onEdit, onDelete }: ConfigItemProps) {
  const uiMeta = extractUIMetadata(config.parameters_json);
  const cmdParamCount = config.command_parameters_json?.length || 0;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-4 hover:border-primary-300 hover:bg-white transition-all">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4">
        <div className="md:col-span-4">
          <div className="text-xs uppercase tracking-wide text-slate-400 md:hidden mb-1">Name</div>
          <h4 className="font-medium text-slate-800 text-sm sm:text-base">{config.command_name}</h4>
          {config.description && <p className="text-xs sm:text-sm text-slate-500 mt-1 line-clamp-2">{config.description}</p>}
        </div>

        <div className="md:col-span-2">
          <div className="text-xs uppercase tracking-wide text-slate-400 md:hidden mb-1">Type</div>
          <div className="flex flex-wrap gap-1.5">
            <span className={`px-2 py-1 text-xs rounded ${
              config.config_type === 'Setting' 
                ? 'bg-primary-100 text-primary-700' 
                : 'bg-amber-100 text-amber-700'
            }`}>
              {config.config_type}
            </span>
            {uiMeta.control && (
              <span className="px-2 py-1 text-xs bg-accent-100 text-accent-700 rounded">
                {uiMeta.control}
              </span>
            )}
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="text-xs uppercase tracking-wide text-slate-400 md:hidden mb-1">Category</div>
          <div className="text-xs sm:text-sm text-slate-600">
            {config.category_type_desc && <div className="text-xs text-slate-400">{config.category_type_desc}</div>}
            <div>{config.category || 'Uncategorized'}</div>
            {config.profile && <div className="text-xs text-slate-400">Profile: {config.profile}</div>}
          </div>
        </div>

        <div className="md:col-span-3">
          <div className="text-xs uppercase tracking-wide text-slate-400 md:hidden mb-1">Parameters</div>
          <div className="text-xs sm:text-sm text-slate-600 space-y-1">
            {/* Show default value if exists */}
            {uiMeta.defaultValue && (
              <div>
                <span className="text-slate-400">Default:</span>{' '}
                <span className="font-mono">{uiMeta.defaultValue}</span>
              </div>
            )}
            
            {/* Show min/max if exists */}
            {(uiMeta.minValue || uiMeta.maxValue) && (
              <div className="text-xs text-slate-400">
                Range: {uiMeta.minValue ?? '—'} to {uiMeta.maxValue ?? '—'}
              </div>
            )}
            
            {/* Show command syntax for Commands */}
            {config.config_type === 'Command' && config.command_syntax && (
              <div className="font-mono text-xs text-amber-600 truncate" title={config.command_syntax}>
                {config.command_syntax}
              </div>
            )}
            
            {/* Show parameter/subdetail counts */}
            <div className="text-xs text-slate-400 flex flex-wrap gap-2 sm:gap-3">
              {uiMeta.paramCount > 0 && (
                <span>{uiMeta.paramCount} param(s), {uiMeta.subDetailCount} subdetail(s)</span>
              )}
              {cmdParamCount > 0 && (
                <span>{cmdParamCount} cmd param(s)</span>
              )}
            </div>
          </div>
        </div>

        <div className="md:col-span-1 flex md:justify-end gap-2">
          <button
            onClick={() => onEdit(config)}
            className="p-2 text-primary-500 hover:text-primary-600 hover:bg-primary-100 rounded-lg transition-all"
            title="Edit"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(config)}
            className="p-2 text-red-500 hover:text-red-600 hover:bg-red-100 rounded-lg transition-all"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
