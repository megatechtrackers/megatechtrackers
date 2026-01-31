import { DeviceConfig, ConfigParameter, SubDetail, CommandParameter } from '@/lib/api';

// Props for the main editor
export interface DeviceConfigEditorProps {
  config?: DeviceConfig;
  deviceName?: string;
  onSave?: (config: DeviceConfig) => void;
  onCancel?: () => void;
}

// Metadata from API
export interface EditorMetadata {
  controlTypes: Array<{ value: string; label: string }>;
  configTypes: Array<{ value: string; label: string }>;
  deviceNames: string[];
}

// Tab types
export type EditorTab = 'basic' | 'parameters' | 'command';

// Default empty SubDetail
export const createEmptySubDetail = (id: number): SubDetail => ({
  SubDetailID: id,
  Control: 'TextBox',
  ControlWidth: null,
  ActualValue: null,
  Description: null,
  CmdText: null,
  CmdValue: null,
  MinValue: null,
  MaxValue: null,
});

// Default empty ConfigParameter
export const createEmptyParameter = (id: number): ConfigParameter => ({
  ParameterID: id,
  ParameterName: '',
  ParameterType: '2', // Configurable
  ParameterValue: null,
  SubDetails: [createEmptySubDetail(1)],
});

// Default empty CommandParameter
export const createEmptyCommandParameter = (id: number, type: '1' | '2' = '1'): CommandParameter => ({
  ParameterID: id,
  ParameterType: type,
  ParameterTypeDesc: type === '1' ? 'Fixed' : 'Configurable',
  ParameterName: '',
  DefaultValue: null,
});
