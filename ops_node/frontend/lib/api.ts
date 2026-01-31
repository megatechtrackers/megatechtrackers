/**
 * API Client for SMS Config V4 Backend
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// Types
export interface DeviceType {
  device_name: string;
  config_count: number;
  setting_count: number;
  command_count: number;
}

// SubDetail: UI control metadata for a single configurable parameter
export interface SubDetail {
  SubDetailID: number;
  Control: string | null;        // TextBox, ComboBox, ATFenceControl, etc.
  ControlWidth: number | null;
  ActualValue: string | null;
  Description: string | null;
  CmdText: string | null;
  CmdValue: string | null;
  MinValue: string | null;
  MaxValue: string | null;
}

// Parameter: Configurable parameter with its UI metadata (SubDetails)
export interface ConfigParameter {
  ParameterID: number;
  ParameterName: string | null;
  ParameterType: string;         // '2' for Configurable
  ParameterValue: string | null; // Default value
  SubDetails: SubDetail[] | null;
}

// CommandParameter: Any parameter (Fixed or Configurable) for command building
export interface CommandParameter {
  ParameterID: number;
  ParameterType: string;         // '1' for Fixed, '2' for Configurable
  ParameterTypeDesc: string;     // 'Fixed' or 'Configurable'
  ParameterName: string | null;
  DefaultValue: string | null;
}

export interface DeviceConfig {
  id?: number;
  device_name: string;
  config_type: string;           // 'Setting' or 'Command'
  category_type_desc: string | null;  // 'General', 'IOProperties', 'GeoFencing'
  category: string | null;       // Category name from CommandCategory
  profile: string | null;        // Profile number (1, 2, 3, 4)
  command_name: string;          // Command name from CommandMaster (display name)
  description: string | null;
  command_seprator: string | null;  // Command separator (note: typo in DB column name)
  command_syntax: string | null;    // Command syntax from CommandMaster
  command_type: string | null;      // Command type from CommandMaster
  
  // command_parameters_json: ALL parameters (Fixed + Configurable) for command building
  command_parameters_json: CommandParameter[] | null;
  
  // parameters_json: Configurable parameters with FULL UI metadata (matches original structure)
  parameters_json: ConfigParameter[] | null;
  
  command_id: number | null;     // CommandMaster.ID - correlation key for unit_value
  created_at?: string;
  updated_at?: string;
}

// Unit: Matches View_UnitViewFromERP structure (original data source)
export interface Unit {
  id: number;
  imei: string;                  // View_UnitViewFromERP.UnitID
  device_name: string;           // View_UnitViewFromERP.UnitName
  mega_id: string | null;        // View_UnitViewFromERP.MegaID
  ffid: string | null;           // View_UnitViewFromERP.FF
  sim_no: string | null;         // View_UnitViewFromERP.ServiceNo
  modem_id: number | null;       // View_UnitViewFromERP.ModemID
  created_date: string;
  updated_at: string;
}

// UnitCreate: Matches View_UnitViewFromERP structure
export interface UnitCreate {
  imei: string;                  // Required
  device_name: string;           // Required
  mega_id?: string | null;
  ffid?: string | null;
  sim_no?: string | null;
  modem_id?: number | null;
}

// UnitConfig: Unit-specific setting with current values (returned from /units/{imei}/settings)
export interface UnitConfig {
  id: number;
  device_name: string;           // Device name from matched DeviceConfig
  command_name: string;          // Display name
  category_type_desc: string | null;  // 'General', 'IOProperties', 'GeoFencing'
  category: string | null;
  profile: string | null;
  command_seprator: string | null;    // Command separator
  command_syntax: string | null;      // Command syntax from CommandMaster
  command_type: string | null;        // Command type from CommandMaster
  command_id: number | null;          // CommandMaster.ID for saving values
  
  // command_parameters_json: ALL parameters for command building
  command_parameters_json: CommandParameter[] | null;
  
  // parameters_json: Configurable parameters with full UI metadata
  parameters_json: ConfigParameter[] | null;
  
  // current_value: Saved value from unit_value (JSON array format)
  // Format: [{"ParameterID": 123, "Value": "val1"}, ...]
  current_value: string | null;
  
  description: string | null;
}

// Command Outbox: Queue for modem
export interface CommandOutbox {
  id: number;
  imei: string;
  sim_no: string;
  command_text: string;
  send_method: string;
  retry_count: number;
  user_id: string | null;
  created_at: string;
}

// Command Sent: Sent commands awaiting reply
export interface CommandSent {
  id: number;
  imei: string;
  sim_no: string;
  command_text: string;
  status: string;  // 'sent', 'failed', 'successful'
  send_method: string;
  error_message: string | null;
  user_id: string | null;
  created_at: string | null;
  sent_at: string | null;
}

// Command Inbox: Incoming SMS from devices
export interface CommandInbox {
  id: number;
  sim_no: string;
  imei: string | null;
  message_text: string;
  received_at: string;
  processed: boolean;
}

// Command History: Archive of all sent/received
export interface CommandHistory {
  id: number;
  imei: string | null;
  sim_no: string | null;
  direction: string;  // 'outgoing' or 'incoming'
  command_text: string;
  status: string | null;
  send_method: string | null;
  user_id: string | null;
  created_at: string | null;
  sent_at: string | null;
  archived_at: string | null;
}

export interface CommandResponse {
  success: boolean;
  message: string;
  command_id?: number;
  command_text?: string;
}

// API Functions

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// Device APIs
export async function getDeviceTypes(): Promise<DeviceType[]> {
  return fetchApi<DeviceType[]>("/devices/");
}

export async function getDeviceConfigs(
  deviceName: string,
  configType?: string
): Promise<DeviceConfig[]> {
  const params = configType ? `?config_type=${configType}` : "";
  return fetchApi<DeviceConfig[]>(`/devices/${deviceName}/configs${params}`);
}

export async function getDeviceCategories(
  deviceName: string
): Promise<{ categories: string[] }> {
  return fetchApi<{ categories: string[] }>(`/devices/${deviceName}/categories`);
}

// Unit APIs
export async function searchUnits(
  query?: string,
  deviceName?: string,
  limit: number = 50
): Promise<Unit[]> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (deviceName) params.set("device_name", deviceName);
  params.set("limit", limit.toString());
  return fetchApi<Unit[]>(`/units/search?${params}`);
}

export async function getUnit(imei: string): Promise<Unit> {
  return fetchApi<Unit>(`/units/${imei}`);
}

export async function getUnitSettings(imei: string): Promise<UnitConfig[]> {
  return fetchApi<UnitConfig[]>(`/units/${imei}/settings`);
}

export async function getUnitCommands(imei: string): Promise<UnitConfig[]> {
  return fetchApi<UnitConfig[]>(`/units/${imei}/commands`);
}

export async function saveUnitConfig(
  imei: string,
  values: Array<{ command_id: number; value: string }>,  // Changed from config_id to command_id
  userId?: string
): Promise<{ success: boolean; saved_count: number }> {
  return fetchApi(`/units/${imei}/values`, {
    method: "PUT",
    body: JSON.stringify({ values, user_id: userId }),
  });
}

export async function createUnit(unit: UnitCreate): Promise<Unit> {
  return fetchApi<Unit>("/units/", {
    method: "POST",
    body: JSON.stringify(unit),
  });
}

// Command APIs
export async function sendCommand(
  imei: string,
  options: {
    config_id?: number;
    value?: string;
    command_text?: string;
    user_id?: string;
    save_value?: boolean;
    send_method?: "sms" | "gprs";
  }
): Promise<CommandResponse> {
  return fetchApi<CommandResponse>(`/commands/${imei}/send`, {
    method: "POST",
    body: JSON.stringify({
      ...options,
      send_method: options.send_method || "sms",
    }),
  });
}

export async function getCommandHistory(
  imei: string,
  days: number = 7
): Promise<CommandHistory[]> {
  return fetchApi<CommandHistory[]>(`/commands/${imei}/history?days=${days}`);
}

export async function getCommandSent(
  imei: string,
  status?: string
): Promise<CommandSent[]> {
  const params = status ? `?status=${status}` : "";
  return fetchApi<CommandSent[]>(`/commands/${imei}/sent${params}`);
}

export async function getCommandInbox(
  imei: string,
  processed?: boolean
): Promise<CommandInbox[]> {
  const params = processed !== undefined ? `?processed=${processed}` : "";
  return fetchApi<CommandInbox[]>(`/commands/${imei}/inbox${params}`);
}

export async function getCommandOutbox(
  imei: string
): Promise<CommandOutbox[]> {
  return fetchApi<CommandOutbox[]>(`/commands/${imei}/outbox`);
}

// Copy Unit Config API
export interface CopyUnitConfigRequest {
  source_imei: string;
  target_imeis: string[];
  send_commands?: boolean;
  send_method?: "sms" | "gprs";
  user_id?: string;
}

export interface CopyUnitConfigResponse {
  success: boolean;
  message: string;
  total_configs: number;
  copied_configs: number;
  skipped_configs: number;
  commands_sent: number;
  errors: Record<string, string>;
}

export async function copyUnitConfig(
  request: CopyUnitConfigRequest
): Promise<CopyUnitConfigResponse> {
  return fetchApi<CopyUnitConfigResponse>("/units/copy-config", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

// Device Config Editor APIs
export interface DeviceConfigMetadata {
  control_types: Array<{ value: string; label: string }>;
  config_types: Array<{ value: string; label: string }>;
}

export interface DeviceMetadata {
  device_names: string[];
}

export async function getDeviceConfigMetadata(): Promise<DeviceConfigMetadata> {
  return fetchApi<DeviceConfigMetadata>("/devices/metadata/control-types");
}

export async function getDeviceMetadata(): Promise<DeviceMetadata> {
  const deviceNames = await fetchApi<{ device_names: string[] }>("/devices/metadata/device-names");
  return {
    device_names: deviceNames.device_names,
  };
}

export async function createDeviceConfig(
  config: DeviceConfig
): Promise<DeviceConfig> {
  return fetchApi<DeviceConfig>("/devices/", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export async function updateDeviceConfig(
  configId: number,
  config: Partial<DeviceConfig>
): Promise<DeviceConfig> {
  return fetchApi<DeviceConfig>(`/devices/${configId}`, {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export async function deleteDeviceConfig(
  configId: number
): Promise<{ success: boolean; message: string }> {
  return fetchApi(`/devices/${configId}`, {
    method: "DELETE",
  });
}

export async function createBulkDeviceConfigs(
  configs: DeviceConfig[]
): Promise<DeviceConfig[]> {
  return fetchApi<DeviceConfig[]>("/devices/bulk", {
    method: "POST",
    body: JSON.stringify(configs),
  });
}

// Device Management APIs
export async function renameDevice(
  oldDeviceName: string,
  newDeviceName: string
): Promise<{ success: boolean; message: string; configs_updated: number }> {
  return fetchApi(`/devices/device/${encodeURIComponent(oldDeviceName)}/rename?new_device_name=${encodeURIComponent(newDeviceName)}`, {
    method: "PUT",
  });
}

export async function deleteDevice(
  deviceName: string
): Promise<{ success: boolean; message: string }> {
  return fetchApi(`/devices/device/${encodeURIComponent(deviceName)}`, {
    method: "DELETE",
  });
}

export async function duplicateDevice(
  deviceName: string,
  newDeviceName: string
): Promise<{ success: boolean; message: string; configs_created: number }> {
  return fetchApi(`/devices/device/${encodeURIComponent(deviceName)}/duplicate?new_device_name=${encodeURIComponent(newDeviceName)}`, {
    method: "POST",
  });
}

// Import/Export APIs
export function getExportUrl(deviceName?: string): string {
  const params = deviceName ? `?device_name=${encodeURIComponent(deviceName)}` : '';
  return `${API_BASE}/devices/export/csv${params}`;
}

export async function importDeviceConfigs(
  file: File,
  updateExisting: boolean = false
): Promise<{ success: boolean; created: number; updated: number; errors: string[]; total_errors: number }> {
  const formData = new FormData();
  formData.append('file', file);
  
  const url = `${API_BASE}/devices/import/csv?update_existing=${updateExisting}`;
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  
  return response.json();
}

// =============================================================================
// IO Mapping Types and APIs
// =============================================================================

export interface DeviceIOMapping {
  id?: number;
  device_name: string;
  io_id: number;
  io_multiplier: number;
  io_type: number;  // 2=Digital, 3=Analog
  io_name: string;
  value_name?: string;
  value?: number | null;
  target: number;  // 0=column, 1=status, 2=both, 3=jsonb
  column_name?: string;
  start_time?: string;
  end_time?: string;
  is_alarm?: number;
  is_sms?: number;
  is_email?: number;
  is_call?: number;
  created_at?: string;
  updated_at?: string;
}

export interface UnitIOMapping {
  id?: number;
  imei: number;
  io_id: number;
  io_multiplier: number;
  io_type: number;  // 2=Digital, 3=Analog
  io_name: string;
  value_name?: string;
  value?: number | null;
  target: number;  // 0=column, 1=status, 2=both, 3=jsonb
  column_name?: string;
  start_time?: string;
  end_time?: string;
  is_alarm?: number;
  is_sms?: number;
  is_email?: number;
  is_call?: number;
  createddate?: string;
  updateddate?: string;
}

export interface ApplyTemplateResponse {
  imei: number;
  device_name: string;
  mappings_created: number;
  mappings_skipped: number;
  message: string;
}

// Device IO Template APIs
export async function getDeviceIOTemplates(deviceName?: string): Promise<DeviceIOMapping[]> {
  const params = deviceName ? `?device_name=${encodeURIComponent(deviceName)}` : '';
  return fetchApi<DeviceIOMapping[]>(`/io-mappings/device-templates${params}`);
}

export async function getDevicesWithTemplates(): Promise<string[]> {
  return fetchApi<string[]>('/io-mappings/device-templates/devices');
}

export async function getDeviceIOTemplate(templateId: number): Promise<DeviceIOMapping> {
  return fetchApi<DeviceIOMapping>(`/io-mappings/device-templates/${templateId}`);
}

export async function createDeviceIOTemplate(mapping: Omit<DeviceIOMapping, 'id' | 'created_at' | 'updated_at'>): Promise<DeviceIOMapping> {
  return fetchApi<DeviceIOMapping>('/io-mappings/device-templates', {
    method: 'POST',
    body: JSON.stringify(mapping),
  });
}

export async function updateDeviceIOTemplate(templateId: number, updates: Partial<DeviceIOMapping>): Promise<DeviceIOMapping> {
  return fetchApi<DeviceIOMapping>(`/io-mappings/device-templates/${templateId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteDeviceIOTemplate(templateId: number): Promise<{ status: string; id: number }> {
  return fetchApi<{ status: string; id: number }>(`/io-mappings/device-templates/${templateId}`, {
    method: 'DELETE',
  });
}

export async function deleteDeviceIOTemplatesByDevice(deviceName: string): Promise<{ status: string; device_name: string; count: number }> {
  return fetchApi<{ status: string; device_name: string; count: number }>(`/io-mappings/device-templates/device/${encodeURIComponent(deviceName)}`, {
    method: 'DELETE',
  });
}

// Unit IO Mapping APIs
export async function getUnitIOMappings(imei?: number): Promise<UnitIOMapping[]> {
  const params = imei ? `?imei=${imei}` : '';
  return fetchApi<UnitIOMapping[]>(`/io-mappings/tracker${params}`);
}

export async function getUnitIOMappingsByImei(imei: number): Promise<UnitIOMapping[]> {
  return fetchApi<UnitIOMapping[]>(`/io-mappings/tracker/${imei}`);
}

export async function createUnitIOMapping(mapping: Omit<UnitIOMapping, 'id' | 'createddate' | 'updateddate'>): Promise<UnitIOMapping> {
  return fetchApi<UnitIOMapping>('/io-mappings/tracker', {
    method: 'POST',
    body: JSON.stringify(mapping),
  });
}

export async function updateUnitIOMapping(imei: number, mappingId: number, updates: Partial<UnitIOMapping>): Promise<UnitIOMapping> {
  return fetchApi<UnitIOMapping>(`/io-mappings/tracker/${imei}/${mappingId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteUnitIOMapping(imei: number, mappingId: number): Promise<{ status: string; id: number }> {
  return fetchApi<{ status: string; id: number }>(`/io-mappings/tracker/${imei}/${mappingId}`, {
    method: 'DELETE',
  });
}

export async function deleteAllUnitIOMappings(imei: number): Promise<{ status: string; imei: number; count: number }> {
  return fetchApi<{ status: string; imei: number; count: number }>(`/io-mappings/tracker/${imei}`, {
    method: 'DELETE',
  });
}

// Template Operations
export async function applyDeviceTemplate(
  imei: number,
  deviceName: string,
  overwrite: boolean = false
): Promise<ApplyTemplateResponse> {
  return fetchApi<ApplyTemplateResponse>('/io-mappings/apply-template', {
    method: 'POST',
    body: JSON.stringify({ imei, device_name: deviceName, overwrite }),
  });
}

export async function copyUnitMappings(
  sourceImei: number,
  targetImei: number,
  overwrite: boolean = false
): Promise<ApplyTemplateResponse> {
  return fetchApi<ApplyTemplateResponse>(`/io-mappings/copy-tracker/${sourceImei}/${targetImei}?overwrite=${overwrite}`, {
    method: 'POST',
  });
}

export async function resetToDeviceDefaults(imei: number): Promise<ApplyTemplateResponse> {
  return fetchApi<ApplyTemplateResponse>(`/io-mappings/reset-to-device/${imei}`, {
    method: 'POST',
  });
}

// IO Mapping Export/Import
export function getIOTemplatesExportUrl(deviceName?: string): string {
  const params = deviceName ? `?device_name=${encodeURIComponent(deviceName)}` : '';
  return `${API_BASE}/io-mappings/device-templates/export/csv${params}`;
}

export async function importIOTemplates(
  file: File,
  deviceName: string,
  updateExisting: boolean = false
): Promise<{ success: boolean; created: number; updated: number; errors: string[] }> {
  const formData = new FormData();
  formData.append('file', file);
  
  const url = `${API_BASE}/io-mappings/device-templates/import/csv?device_name=${encodeURIComponent(deviceName)}&update_existing=${updateExisting}`;
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  
  return response.json();
}

// =============================================================================
// Location References (POI) APIs
// =============================================================================

export interface LocationReference {
  id: number;
  latitude: number;
  longitude: number;  
  reference: string;
}

export interface NearestLocationReference extends LocationReference {
  distance_km: number;
}

export async function getLocationReferences(
  search?: string,
  limit: number = 100,
  offset: number = 0
): Promise<LocationReference[]> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  params.set('limit', limit.toString());
  params.set('offset', offset.toString());
  return fetchApi<LocationReference[]>(`/location-references/?${params}`);
}

export async function getLocationReferencesCount(search?: string): Promise<{ count: number }> {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  return fetchApi<{ count: number }>(`/location-references/count${params}`);
}

export async function getNearestLocationReferences(
  lat: number,
  lng: number,
  limit: number = 5,
  maxDistanceKm: number = 100
): Promise<NearestLocationReference[]> {
  return fetchApi<NearestLocationReference[]>(`/location-references/nearest?lat=${lat}&lng=${lng}&limit=${limit}&max_distance_km=${maxDistanceKm}`);
}

export async function getLocationReference(id: number): Promise<LocationReference> {
  return fetchApi<LocationReference>(`/location-references/${id}`);
}

export async function createLocationReference(ref: Omit<LocationReference, 'id'> & { id?: number }): Promise<LocationReference> {
  return fetchApi<LocationReference>('/location-references/', {
    method: 'POST',
    body: JSON.stringify(ref),
  });
}

export async function updateLocationReference(id: number, updates: Partial<LocationReference>): Promise<LocationReference> {
  return fetchApi<LocationReference>(`/location-references/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteLocationReference(id: number): Promise<{ status: string; id: number }> {
  return fetchApi<{ status: string; id: number }>(`/location-references/${id}`, {
    method: 'DELETE',
  });
}

export async function deleteAllLocationReferences(): Promise<{ status: string; count: number }> {
  return fetchApi<{ status: string; count: number }>('/location-references/?confirm=true', {
    method: 'DELETE',
  });
}

export function getLocationReferencesExportUrl(): string {
  return `${API_BASE}/location-references/export/csv`;
}

export async function importLocationReferences(
  file: File,
  updateExisting: boolean = false
): Promise<{ success: boolean; created: number; updated: number; errors: string[] }> {
  const formData = new FormData();
  formData.append('file', file);
  
  const url = `${API_BASE}/location-references/import/csv?update_existing=${updateExisting}`;
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  
  return response.json();
}