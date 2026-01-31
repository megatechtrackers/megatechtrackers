'use client';

import { DeviceConfig } from '@/lib/api';
import { EditorMetadata } from './types';

interface BasicInfoTabProps {
  formData: Partial<DeviceConfig>;
  metadata: EditorMetadata | null;
  deviceName?: string;
  onChange: (field: keyof DeviceConfig, value: any) => void;
}

export default function BasicInfoTab({
  formData,
  metadata,
  deviceName,
  onChange,
}: BasicInfoTabProps) {
  return (
    <div className="space-y-4">
      {/* Device Name & Config Type */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Device Name *</label>
          {deviceName ? (
            <input
              type="text"
              value={deviceName}
              disabled
              className="w-full px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed"
            />
          ) : (
            <select
              value={formData.device_name || ''}
              onChange={(e) => onChange('device_name', e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Select device...</option>
              {metadata?.deviceNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Config Type *</label>
          <select
            value={formData.config_type || 'Setting'}
            onChange={(e) => onChange('config_type', e.target.value)}
            required
            className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {metadata?.configTypes.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Command Name */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Command Name *</label>
        <input
          type="text"
          value={formData.command_name || ''}
          onChange={(e) => onChange('command_name', e.target.value)}
          required
          placeholder="e.g., Report Interval, Set APN"
          className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 placeholder-slate-400"
        />
      </div>

      {/* Category Info */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Category Type</label>
          <select
            value={formData.category_type_desc || ''}
            onChange={(e) => onChange('category_type_desc', e.target.value || null)}
            className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">None</option>
            <option value="General">General</option>
            <option value="IOProperties">IOProperties</option>
            <option value="GeoFencing">GeoFencing</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Category</label>
          <input
            type="text"
            value={formData.category || ''}
            onChange={(e) => onChange('category', e.target.value || null)}
            placeholder="e.g., General Settings"
            className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 placeholder-slate-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Profile</label>
          <input
            type="text"
            value={formData.profile || ''}
            onChange={(e) => onChange('profile', e.target.value || null)}
            placeholder="e.g., 1, 2, 3, 4"
            className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 placeholder-slate-400"
          />
        </div>
      </div>

      {/* Command Settings */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Command Separator</label>
          <input
            type="text"
            value={formData.command_seprator || ''}
            onChange={(e) => onChange('command_seprator', e.target.value || null)}
            placeholder="e.g., , (comma)"
            className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono focus:ring-2 focus:ring-primary-500 focus:border-primary-500 placeholder-slate-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Command Syntax</label>
          <input
            type="text"
            value={formData.command_syntax || ''}
            onChange={(e) => onChange('command_syntax', e.target.value || null)}
            placeholder="e.g., GETINFO#"
            className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono focus:ring-2 focus:ring-primary-500 focus:border-primary-500 placeholder-slate-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Command Type</label>
          <select
            value={formData.command_type || ''}
            onChange={(e) => onChange('command_type', e.target.value || null)}
            className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">None</option>
            <option value="1">Direct Command (1)</option>
            <option value="2">Setting (2)</option>
          </select>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => onChange('description', e.target.value || null)}
          rows={3}
          placeholder="Description of this setting/command"
          className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 placeholder-slate-400 resize-none"
        />
      </div>

      {/* Command ID (read-only) */}
      {formData.command_id && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Command ID (from migration)</label>
          <input
            type="text"
            value={formData.command_id}
            disabled
            className="w-full px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed"
          />
        </div>
      )}
    </div>
  );
}
