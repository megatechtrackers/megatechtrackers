'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import {
  DeviceConfig,
  ConfigParameter,
  CommandParameter,
  getDeviceConfigMetadata,
  getDeviceMetadata,
  createDeviceConfig,
  updateDeviceConfig,
} from '@/lib/api';
import { DeviceConfigEditorProps, EditorMetadata, EditorTab } from './types';
import BasicInfoTab from './BasicInfoTab';
import ParametersTab from './ParametersTab';
import CommandBuildTab from './CommandBuildTab';

export default function DeviceConfigEditor({
  config,
  deviceName,
  onSave,
  onCancel,
}: DeviceConfigEditorProps) {
  // Basic form data
  const [formData, setFormData] = useState<Partial<DeviceConfig>>({
    device_name: deviceName || '',
    config_type: 'Setting',
    category_type_desc: null,
    category: null,
    profile: null,
    command_name: '',
    description: null,
    command_seprator: ',',
    command_syntax: null,
    command_type: null,
    command_parameters_json: null,
    parameters_json: null,
    command_id: null,
  });

  // Parameters for UI (configurable parameters with SubDetails)
  const [parameters, setParameters] = useState<ConfigParameter[]>([]);
  
  // Command parameters for command building (Fixed + Configurable)
  const [commandParameters, setCommandParameters] = useState<CommandParameter[]>([]);

  // Metadata
  const [metadata, setMetadata] = useState<EditorMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>('basic');

  // Load config data
  useEffect(() => {
    if (config) {
      setFormData({
        ...config,
        device_name: deviceName || config.device_name,
      });
      
      // Load parameters_json
      if (config.parameters_json && Array.isArray(config.parameters_json)) {
        setParameters(config.parameters_json);
      } else {
        setParameters([]);
      }
      
      // Load command_parameters_json
      if (config.command_parameters_json && Array.isArray(config.command_parameters_json)) {
        setCommandParameters(config.command_parameters_json);
      } else {
        setCommandParameters([]);
      }
    } else {
      setFormData(prev => ({
        ...prev,
        device_name: deviceName || '',
      }));
    }
  }, [config, deviceName]);

  // Load metadata
  useEffect(() => {
    loadMetadata();
  }, []);

  const loadMetadata = async () => {
    try {
      const [controlMeta, deviceMeta] = await Promise.all([
        getDeviceConfigMetadata(),
        getDeviceMetadata(),
      ]);
      setMetadata({
        controlTypes: controlMeta.control_types,
        configTypes: controlMeta.config_types,
        deviceNames: deviceMeta.device_names,
      });
    } catch (error) {
      console.error('Failed to load metadata:', error);
    }
  };

  const handleChange = (field: keyof DeviceConfig, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const configToSave: Partial<DeviceConfig> = {
        ...formData,
        parameters_json: parameters.length > 0 ? parameters : null,
        command_parameters_json: commandParameters.length > 0 ? commandParameters : null,
      };

      let savedConfig: DeviceConfig;
      if (config?.id) {
        savedConfig = await updateDeviceConfig(config.id, configToSave);
      } else {
        savedConfig = await createDeviceConfig(configToSave as DeviceConfig);
      }

      onSave?.(savedConfig);
    } catch (error) {
      console.error('Save failed:', error);
      alert('Save failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-800">
              {config ? 'Edit Configuration' : 'New Configuration'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {formData.device_name || 'Select device'} - {formData.config_type}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {(['basic', 'parameters', 'command'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'text-primary-600 border-b-2 border-primary-500 bg-primary-50/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab === 'basic' && 'Basic Info'}
              {tab === 'parameters' && `UI Params (${parameters.length})`}
              {tab === 'command' && `Command (${commandParameters.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === 'basic' && (
            <BasicInfoTab
              formData={formData}
              metadata={metadata}
              deviceName={deviceName}
              onChange={handleChange}
            />
          )}

          {activeTab === 'parameters' && (
            <ParametersTab
              parameters={parameters}
              metadata={metadata}
              onChange={setParameters}
            />
          )}

          {activeTab === 'command' && (
            <CommandBuildTab
              commandParameters={commandParameters}
              separator={formData.command_seprator || ','}
              onChange={setCommandParameters}
            />
          )}
        </form>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 p-4 sm:p-6 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="w-full sm:w-auto px-6 py-2.5 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full sm:w-auto px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 shadow-sm"
          >
            {loading ? 'Saving...' : config ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Re-export types for external use
export type { DeviceConfigEditorProps } from './types';
