'use client';

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, ArrowLeft, Upload, Download, Pencil, Trash2, Copy, X, FileText, AlertCircle, CheckCircle, FolderTree, Settings, Terminal } from 'lucide-react';
import { 
  getDeviceTypes, getDeviceConfigs, deleteDeviceConfig, 
  renameDevice, deleteDevice, duplicateDevice,
  getExportUrl, importDeviceConfigs, createDeviceConfig,
  DeviceType, DeviceConfig 
} from '@/lib/api';
import DeviceConfigEditor from '@/components/DeviceConfigEditor';
import { useAdminHierarchy } from './useAdminHierarchy';
import TreeSidebar from './TreeSidebar';
import ConfigItem from './ConfigItem';
import { cn } from '@/lib/utils';

// Module-level cache to prevent multiple loads across remounts
let deviceTypesCache: DeviceType[] | null = null;
let deviceTypesLoading = false;

// Wrapper component for Suspense boundary
export default function AdminDevicesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <AdminDevicesPageContent />
    </Suspense>
  );
}

function AdminDevicesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>(deviceTypesCache || []);
  const [selectedDeviceType, setSelectedDeviceType] = useState<string | null>(null);
  const [configs, setConfigs] = useState<DeviceConfig[]>([]);
  const [loading, setLoading] = useState(!deviceTypesCache);
  const [error, setError] = useState<string | null>(null);
  
  // Ref to track if this component instance has already loaded
  const hasLoadedRef = useRef(false);

  // Active tab: configs | import | export | devices
  const [activeTab, setActiveTab] = useState<'configs' | 'import' | 'export' | 'devices'>('configs');

  // Config type filter (Settings vs Commands) - tabs within configs
  const [configTypeFilter, setConfigTypeFilter] = useState<'Setting' | 'Command'>('Setting');
  
  // Tree selection state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConfigs, setSelectedConfigs] = useState<DeviceConfig[]>([]);
  
  // Search
  const [settingsSearch, setSettingsSearch] = useState('');

  // Editor modal
  const [editingConfig, setEditingConfig] = useState<DeviceConfig | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  // Device management modals
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [deviceToManage, setDeviceToManage] = useState<string | null>(null);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [addingDevice, setAddingDevice] = useState(false);

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importUpdateExisting, setImportUpdateExisting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; created: number; updated: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check URL params for tab
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'import' || tab === 'export' || tab === 'devices') {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Load device types on mount (only once)
  useEffect(() => {
    // If we already have cached data, use it immediately - no state update needed if already set
    if (deviceTypesCache && deviceTypes.length === 0) {
      setDeviceTypes(deviceTypesCache);
      setLoading(false);
      return;
    }
    
    // If cache exists and state is already populated, do nothing
    if (deviceTypesCache && deviceTypes.length > 0) {
      setLoading(false);
      return;
    }

    // Prevent duplicate loads from this component instance
    if (hasLoadedRef.current || deviceTypesLoading) {
      return;
    }

    // Mark as loading
    hasLoadedRef.current = true;
    deviceTypesLoading = true;
    setLoading(true);

    getDeviceTypes()
      .then((data) => {
        deviceTypesCache = data;
        deviceTypesLoading = false;
        setDeviceTypes(data);
      })
      .catch((err) => {
        console.error('Failed to load device types:', err);
        setError('Failed to load device types');
        deviceTypesLoading = false;
        hasLoadedRef.current = false; // Allow retry on error
      })
      .finally(() => {
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount

  // Load device types function for manual refreshes
  const loadDeviceTypes = useCallback((force = false) => {
    // Only allow forced reloads
    if (!force) {
      return;
    }
    
    // Reset module-level flags and cache to allow fresh load
    deviceTypesCache = null;
    deviceTypesLoading = false;
    hasLoadedRef.current = false;
    
    setLoading(true);
    deviceTypesLoading = true;
    
    getDeviceTypes()
      .then((data) => {
        deviceTypesCache = data;
        deviceTypesLoading = false;
        setDeviceTypes(data);
      })
      .catch((err) => { 
        console.error('Failed to load device types:', err); 
        setError('Failed to load device types');
        deviceTypesLoading = false;
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Load configs when device type changes (load all, filter client-side)
  useEffect(() => {
    if (!selectedDeviceType) { 
      setConfigs([]); 
      setSelectedNodeId(null);
      setSelectedConfigs([]);
      return; 
    }
    setLoading(true);
    getDeviceConfigs(selectedDeviceType)
      .then((data) => {
        setConfigs(data);
        // Reset selection when device changes
        setSelectedNodeId(null);
        setSelectedConfigs([]);
      })
      .catch((err) => { console.error('Failed to load configs:', err); setError('Failed to load device configurations'); })
      .finally(() => setLoading(false));
  }, [selectedDeviceType]);

  // Build admin hierarchy with config type filter
  const hierarchy = useAdminHierarchy(configs, configTypeFilter);

  // Handle tree node selection
  const handleNodeSelect = useCallback((nodeId: string, nodeConfigs: DeviceConfig[]) => {
    setSelectedNodeId(nodeId);
    setSelectedConfigs(nodeConfigs);
  }, []);

  // Reset selection when config type changes
  useEffect(() => {
    setSelectedNodeId(null);
    setSelectedConfigs([]);
  }, [configTypeFilter]);

  // Auto-select first node when hierarchy changes and nothing selected
  useEffect(() => {
    if (hierarchy.tree.length > 0 && !selectedNodeId && selectedDeviceType) {
      const firstNode = hierarchy.tree[0];
      // Only auto-select leaf nodes or nodes with configs
      if (firstNode.configs) {
        setSelectedNodeId(firstNode.id);
        setSelectedConfigs(firstNode.configs);
      }
    }
  }, [hierarchy.tree, selectedNodeId, selectedDeviceType]);

  // Filter displayed configs by search
  const displayedConfigs = useMemo(() => {
    if (!settingsSearch.trim()) {
      return selectedConfigs;
    }
    
    const query = settingsSearch.toLowerCase();
    // When searching, search all configs of current type
    const allTypeConfigs = configs.filter(c => c.config_type === configTypeFilter);
    return allTypeConfigs.filter((config) =>
      config.command_name?.toLowerCase().includes(query) ||
      config.description?.toLowerCase().includes(query) ||
      config.category?.toLowerCase().includes(query) ||
      config.category_type_desc?.toLowerCase().includes(query)
    );
  }, [selectedConfigs, settingsSearch, configs, configTypeFilter]);

  const handleEdit = (config: DeviceConfig) => {
    setEditingConfig(config);
    setShowEditor(true);
  };

  const handleDelete = async (config: DeviceConfig) => {
    if (confirm(`Are you sure you want to delete "${config.command_name}"?`)) {
      try {
        await deleteDeviceConfig(config.id!);
        setConfigs((prev) => prev.filter((c) => c.id !== config.id));
      } catch (err) {
        console.error('Failed to delete config:', err);
        alert('Failed to delete configuration');
      }
    }
  };

  const handleEditorSave = () => {
    setShowEditor(false);
    setEditingConfig(null);
    if (selectedDeviceType) {
      getDeviceConfigs(selectedDeviceType)
        .then((data) => {
          setConfigs(data);
          // Keep selection if possible, otherwise reset
          if (selectedNodeId) {
            const newConfigs = data.filter(c => c.config_type === configTypeFilter);
            // Try to find configs for the selected node in the new data
            // This is a simplified refresh - the hierarchy will rebuild automatically
          }
        })
        .catch(console.error);
    }
  };

  const handleEditorClose = () => {
    setShowEditor(false);
    setEditingConfig(null);
  };

  // Device management handlers
  const handleRenameDevice = async () => {
    if (!deviceToManage || !newDeviceName.trim()) return;
    try {
      await renameDevice(deviceToManage, newDeviceName.trim());
      loadDeviceTypes(true);
      if (selectedDeviceType === deviceToManage) {
        setSelectedDeviceType(newDeviceName.trim());
      }
      setShowRenameModal(false);
      setDeviceToManage(null);
      setNewDeviceName('');
    } catch (err: any) {
      alert(err.message || 'Failed to rename device');
    }
  };

  const handleDeleteDevice = async (deviceName: string) => {
    if (!confirm(`Are you sure you want to delete device "${deviceName}" and ALL its configurations? This cannot be undone.`)) return;
    try {
      await deleteDevice(deviceName);
      loadDeviceTypes(true);
      if (selectedDeviceType === deviceName) {
        setSelectedDeviceType(null);
        setConfigs([]);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete device');
    }
  };

  const handleDuplicateDevice = async () => {
    if (!deviceToManage || !newDeviceName.trim()) return;
    try {
      await duplicateDevice(deviceToManage, newDeviceName.trim());
      loadDeviceTypes(true);
      setShowDuplicateModal(false);
      setDeviceToManage(null);
      setNewDeviceName('');
    } catch (err: any) {
      alert(err.message || 'Failed to duplicate device');
    }
  };

  const handleAddDevice = async () => {
    if (!newDeviceName.trim()) return;
    setAddingDevice(true);
    try {
      // Create a dummy config entry to register the new device
      await createDeviceConfig({
        device_name: newDeviceName.trim(),
        config_type: 'Setting',
        command_name: 'Device Info',
        category_type_desc: 'General',
        category: 'Info',
        description: 'Device information and metadata',
      } as DeviceConfig);
      loadDeviceTypes(true);
      setShowAddDeviceModal(false);
      setNewDeviceName('');
    } catch (err: any) {
      alert(err.message || 'Failed to create device');
    } finally {
      setAddingDevice(false);
    }
  };

  // Import handler
  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importDeviceConfigs(importFile, importUpdateExisting);
      setImportResult(result);
      if (result.created > 0 || result.updated > 0) {
        loadDeviceTypes(true);
      }
    } catch (err: any) {
      setImportResult({ success: false, created: 0, updated: 0, errors: [err.message] });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <button onClick={() => router.push('/')} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-2 transition-colors text-sm">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </button>
            <h1 className="text-2xl font-bold text-slate-800">Device Configurations</h1>
            <p className="text-slate-500 text-sm">Manage device settings and commands</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-4 p-1 bg-slate-100 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('configs')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'configs' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
          >
            Configurations
          </button>
          <button
            onClick={() => setActiveTab('devices')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'devices' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
          >
            Manage Devices
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'import' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
          >
            Import
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'export' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
          >
            Export
          </button>
        </div>

        {/* CONFIGURATIONS TAB */}
        {activeTab === 'configs' && (
          <>
            {/* Device Selection */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 shadow-sm">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Device</label>
                  <select
                    value={selectedDeviceType || ''}
                    onChange={(e) => { 
                      const newDevice = e.target.value || null;
                      setSelectedDeviceType(newDevice);
                      setSettingsSearch('');
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
                  >
                    <option value="">Select device...</option>
                    {deviceTypes.map((dt) => (
                      <option key={dt.device_name} value={dt.device_name}>{dt.device_name} ({dt.config_count})</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => { setEditingConfig(null); setShowEditor(true); }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Config
                </button>
              </div>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm mb-4">{error}</div>
            )}

            {/* Content when device selected */}
            {!loading && selectedDeviceType && (
              <>
                {/* Config Type Tabs (Settings / Commands) */}
                <div className="bg-white rounded-xl border border-slate-200 mb-4 shadow-sm overflow-hidden">
                  <div className="flex border-b border-slate-200">
                    <button
                      onClick={() => setConfigTypeFilter('Setting')}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all",
                        configTypeFilter === 'Setting'
                          ? "bg-primary-50 text-primary-700 border-b-2 border-primary-500"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                      )}
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                      <span className={cn(
                        "px-1.5 py-0.5 rounded-full text-xs",
                        configTypeFilter === 'Setting' 
                          ? "bg-primary-100 text-primary-700" 
                          : "bg-slate-100 text-slate-500"
                      )}>
                        {hierarchy.totalSettings}
                      </span>
                    </button>
                    <button
                      onClick={() => setConfigTypeFilter('Command')}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all",
                        configTypeFilter === 'Command'
                          ? "bg-accent-50 text-accent-700 border-b-2 border-accent-500"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                      )}
                    >
                      <Terminal className="w-4 h-4" />
                      Commands
                      <span className={cn(
                        "px-1.5 py-0.5 rounded-full text-xs",
                        configTypeFilter === 'Command' 
                          ? "bg-accent-100 text-accent-700" 
                          : "bg-slate-100 text-slate-500"
                      )}>
                        {hierarchy.totalCommands}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Two-Panel Layout */}
                <div className="flex flex-col lg:flex-row gap-4" style={{ minHeight: "400px" }}>
                  {/* Left Sidebar - Tree Navigation */}
                  <TreeSidebar
                    tree={hierarchy.tree}
                    selectedNodeId={selectedNodeId}
                    onSelectNode={handleNodeSelect}
                  />

                  {/* Right Panel - Config List */}
                  <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col shadow-sm lg:max-h-[calc(100vh-380px)]">
                    {/* Search Bar */}
                    <div className="p-3 border-b border-slate-200 bg-slate-50">
                      <input
                        type="text"
                        placeholder={`Search all ${configTypeFilter === 'Setting' ? 'settings' : 'commands'}...`}
                        value={settingsSearch}
                        onChange={(e) => setSettingsSearch(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-slate-400"
                      />
                      {settingsSearch.trim() && (
                        <p className="text-xs text-slate-500 mt-1">
                          Searching all {configTypeFilter === 'Setting' ? 'settings' : 'commands'}
                        </p>
                      )}
                    </div>

                    {/* Config List */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                      {displayedConfigs.length > 0 ? (
                        displayedConfigs.map((config) => (
                          <ConfigItem 
                            key={config.id} 
                            config={config} 
                            onEdit={handleEdit} 
                            onDelete={handleDelete} 
                          />
                        ))
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                          <FolderTree className="w-8 h-8 mb-3 opacity-50" />
                          <p className="text-sm">
                            {settingsSearch.trim()
                              ? `No ${configTypeFilter === 'Setting' ? 'settings' : 'commands'} match your search`
                              : hierarchy.tree.length === 0
                              ? `No ${configTypeFilter === 'Setting' ? 'settings' : 'commands'} configured`
                              : "Select an item from the tree"}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Footer with count */}
                    {displayedConfigs.length > 0 && (
                      <div className="p-2 border-t border-slate-200 bg-slate-50 text-center">
                        <span className="text-xs text-slate-500">
                          {displayedConfigs.length} {displayedConfigs.length === 1 ? 'config' : 'configs'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* MANAGE DEVICES TAB */}
        {activeTab === 'devices' && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Manage Devices</h2>
                <p className="text-xs text-slate-500">{deviceTypes.length} devices</p>
              </div>
              <button
                onClick={() => { setNewDeviceName(''); setShowAddDeviceModal(true); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add Device
              </button>
            </div>
            <div className="space-y-2">
              {deviceTypes.map((device) => (
                <div key={device.device_name} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div>
                    <p className="font-medium text-slate-800">{device.device_name}</p>
                    <p className="text-xs text-slate-500">{device.setting_count} settings • {device.command_count} commands</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setDeviceToManage(device.device_name); setNewDeviceName(device.device_name); setShowRenameModal(true); }}
                      className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                      title="Rename"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setDeviceToManage(device.device_name); setNewDeviceName(`${device.device_name}_copy`); setShowDuplicateModal(true); }}
                      className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                      title="Duplicate"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteDevice(device.device_name)}
                      className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {deviceTypes.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-slate-400 mb-3">No devices found.</p>
                  <button
                    onClick={() => { setNewDeviceName(''); setShowAddDeviceModal(true); }}
                    className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    + Add your first device
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* IMPORT TAB */}
        {activeTab === 'import' && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Import Device Configurations</h2>
            
            <div className="space-y-4">
              {/* File Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">CSV File</label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv"
                  onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportResult(null); }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-primary-100 file:text-primary-700 file:text-sm file:font-medium"
                />
                {importFile && (
                  <p className="text-xs text-slate-500 mt-1">Selected: {importFile.name}</p>
                )}
              </div>

              {/* Options */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={importUpdateExisting}
                  onChange={(e) => setImportUpdateExisting(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500"
                />
                <span className="text-sm text-slate-700">Update existing configs (match by command_id)</span>
              </label>

              {/* Import Button */}
              <button
                onClick={handleImport}
                disabled={!importFile || importing}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium transition-all"
              >
                {importing ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {importing ? 'Importing...' : 'Import'}
              </button>

              {/* Result */}
              {importResult && (
                <div className={`p-3 rounded-lg ${importResult.errors.length === 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
                  <div className="flex items-start gap-2">
                    {importResult.errors.length === 0 ? (
                      <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                    )}
                    <div className="text-sm">
                      <p className="font-medium text-slate-800">
                        Created: {importResult.created} • Updated: {importResult.updated}
                      </p>
                      {importResult.errors.length > 0 && (
                        <div className="mt-2">
                          <p className="text-amber-700 font-medium">Errors ({importResult.errors.length}):</p>
                          <ul className="list-disc list-inside text-amber-700 text-xs mt-1 max-h-32 overflow-y-auto">
                            {importResult.errors.slice(0, 10).map((err, i) => <li key={i}>{err}</li>)}
                            {importResult.errors.length > 10 && <li>...and {importResult.errors.length - 10} more</li>}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* CSV Format Info */}
              <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-slate-500" />
                  <h3 className="text-sm font-medium text-slate-700">CSV Format</h3>
                </div>
                <p className="text-xs text-slate-600 mb-2">Required columns: device_name, config_type, command_name</p>
                <p className="text-xs text-slate-600">Optional: category_type_desc, category, profile, description, command_seprator, command_syntax, command_type, command_parameters_json, parameters_json, command_id</p>
                <p className="text-xs text-slate-500 mt-2">Tip: Export existing configs first to see the format.</p>
              </div>
            </div>
          </div>
        )}

        {/* EXPORT TAB */}
        {activeTab === 'export' && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Export Device Configurations</h2>
            
            <div className="space-y-4">
              {/* Export All */}
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-800">Export All Devices</p>
                    <p className="text-xs text-slate-500">{deviceTypes.reduce((a, d) => a + d.config_count, 0)} total configurations</p>
                  </div>
                  <a
                    href={getExportUrl()}
                    download
                    className="flex items-center gap-2 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-all"
                  >
                    <Download className="w-4 h-4" />
                    Download CSV
                  </a>
                </div>
              </div>

              {/* Export by Device */}
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-2">Export by Device</h3>
                <div className="space-y-2">
                  {deviceTypes.map((device) => (
                    <div key={device.device_name} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div>
                        <p className="font-medium text-slate-800">{device.device_name}</p>
                        <p className="text-xs text-slate-500">{device.config_count} configurations</p>
                      </div>
                      <a
                        href={getExportUrl(device.device_name)}
                        download
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-all"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {showEditor && (
        <DeviceConfigEditor
          config={editingConfig || undefined}
          deviceName={selectedDeviceType || ''}
          onCancel={handleEditorClose}
          onSave={handleEditorSave}
        />
      )}

      {/* Rename Modal */}
      {showRenameModal && deviceToManage && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 max-w-sm w-full shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Rename Device</h3>
              <button onClick={() => { setShowRenameModal(false); setDeviceToManage(null); }} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-3">Renaming: <strong>{deviceToManage}</strong></p>
            <input
              type="text"
              value={newDeviceName}
              onChange={(e) => setNewDeviceName(e.target.value)}
              placeholder="New device name"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowRenameModal(false); setDeviceToManage(null); }} className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-100">Cancel</button>
              <button onClick={handleRenameDevice} className="px-3 py-1.5 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600">Rename</button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Modal */}
      {showDuplicateModal && deviceToManage && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 max-w-sm w-full shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Duplicate Device</h3>
              <button onClick={() => { setShowDuplicateModal(false); setDeviceToManage(null); }} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-3">Duplicating: <strong>{deviceToManage}</strong></p>
            <input
              type="text"
              value={newDeviceName}
              onChange={(e) => setNewDeviceName(e.target.value)}
              placeholder="New device name"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowDuplicateModal(false); setDeviceToManage(null); }} className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-100">Cancel</button>
              <button onClick={handleDuplicateDevice} className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600">Duplicate</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Device Modal */}
      {showAddDeviceModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 max-w-sm w-full shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Add New Device</h3>
              <button onClick={() => setShowAddDeviceModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-3">Enter a name for the new device type. A default &quot;Device Info&quot; setting will be created.</p>
            <input
              type="text"
              value={newDeviceName}
              onChange={(e) => setNewDeviceName(e.target.value)}
              placeholder="Device name (e.g., GT06N)"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAddDevice()}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddDeviceModal(false)} className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-100">Cancel</button>
              <button 
                onClick={handleAddDevice} 
                disabled={!newDeviceName.trim() || addingDevice}
                className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {addingDevice && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {addingDevice ? 'Creating...' : 'Create Device'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
