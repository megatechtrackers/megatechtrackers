'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ArrowLeft, Pencil, Trash2, Copy, X, AlertCircle, CheckCircle, FileInput, Cpu, Radio } from 'lucide-react';
import {
  getDeviceTypes,
  getDeviceIOTemplates,
  createDeviceIOTemplate,
  updateDeviceIOTemplate,
  deleteDeviceIOTemplate,
  deleteDeviceIOTemplatesByDevice,
  getUnitIOMappingsByImei,
  createUnitIOMapping,
  updateUnitIOMapping,
  deleteUnitIOMapping,
  deleteAllUnitIOMappings,
  applyDeviceTemplate,
  copyUnitMappings,
  searchUnits,
  DeviceType,
  DeviceIOMapping,
  UnitIOMapping,
  Unit,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { timeUTCToLocal, timeLocalToUTC } from '@/lib/timeUtils';
import { useWorkingTimezone } from '@/lib/TimezoneContext';

// IO Type labels
const IO_TYPES: Record<number, string> = {
  2: 'Digital',
  3: 'Analog',
};

// Target type labels
const TARGET_TYPES: Record<number, string> = {
  0: 'Column',
  1: 'Status',
  2: 'Both',
  3: 'JSONB',
};

// Wrapper component for Suspense boundary
export default function UnitIOMappingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <UnitIOMappingPageContent />
    </Suspense>
  );
}

function UnitIOMappingPageContent() {
  const router = useRouter();
  const { workingTimezone } = useWorkingTimezone();
  const [activeTab, setActiveTab] = useState<'device-templates' | 'tracker-mappings'>('device-templates');
  
  // Device templates state
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [deviceTemplates, setDeviceTemplates] = useState<DeviceIOMapping[]>([]);
  
  // Tracker mappings state
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitSearch, setUnitSearch] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [trackerMappings, setTrackerMappings] = useState<UnitIOMapping[]>([]);
  
  // Common state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Modal state
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DeviceIOMapping | UnitIOMapping | null>(null);
  const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false);
  const [showCopyMappingsModal, setShowCopyMappingsModal] = useState(false);
  const [sourceImei, setSourceImei] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  
  // Load device types on mount
  useEffect(() => {
    getDeviceTypes().then(setDeviceTypes).catch(console.error);
  }, []);
  
  // Load device templates when device changes
  useEffect(() => {
    if (selectedDevice) {
      setLoading(true);
      getDeviceIOTemplates(selectedDevice)
        .then(setDeviceTemplates)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    } else {
      setDeviceTemplates([]);
    }
  }, [selectedDevice]);
  
  // Search units
  const handleUnitSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setUnits([]);
      return;
    }
    try {
      const results = await searchUnits(query, undefined, 20);
      setUnits(results);
    } catch (err) {
      console.error('Failed to search units:', err);
    }
  }, []);
  
  // Load tracker mappings when unit selected
  useEffect(() => {
    if (selectedUnit) {
      setLoading(true);
      getUnitIOMappingsByImei(parseInt(selectedUnit.imei))
        .then(setTrackerMappings)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    } else {
      setTrackerMappings([]);
    }
  }, [selectedUnit]);
  
  // Create/update device template
  const handleSaveDeviceTemplate = async (data: Partial<DeviceIOMapping>) => {
    if (!selectedDevice) return;
    
    try {
      if (editingTemplate && 'id' in editingTemplate && editingTemplate.id) {
        await updateDeviceIOTemplate(editingTemplate.id, data);
        setSuccess('Template updated successfully');
      } else {
        await createDeviceIOTemplate({ ...data, device_name: selectedDevice } as any);
        setSuccess('Template created successfully');
      }
      // Refresh templates
      const templates = await getDeviceIOTemplates(selectedDevice);
      setDeviceTemplates(templates);
      setShowEditor(false);
      setEditingTemplate(null);
    } catch (err: any) {
      setError(err.message);
    }
  };
  
  // Delete device template
  const handleDeleteDeviceTemplate = async (id: number) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    
    try {
      await deleteDeviceIOTemplate(id);
      setDeviceTemplates((prev) => prev.filter((t) => t.id !== id));
      setSuccess('Template deleted');
    } catch (err: any) {
      setError(err.message);
    }
  };
  
  // Delete all templates for device
  const handleDeleteAllDeviceTemplates = async () => {
    if (!selectedDevice) return;
    if (!confirm(`Are you sure you want to delete ALL templates for ${selectedDevice}?`)) return;
    
    try {
      const result = await deleteDeviceIOTemplatesByDevice(selectedDevice);
      setDeviceTemplates([]);
      setSuccess(`Deleted ${result.count} templates`);
    } catch (err: any) {
      setError(err.message);
    }
  };
  
  // Create/update tracker mapping
  const handleSaveTrackerMapping = async (data: Partial<UnitIOMapping>) => {
    if (!selectedUnit) return;
    
    try {
      const imei = parseInt(selectedUnit.imei);
      if (editingTemplate && 'id' in editingTemplate && editingTemplate.id) {
        await updateUnitIOMapping(imei, editingTemplate.id, data);
        setSuccess('Mapping updated successfully');
      } else {
        await createUnitIOMapping({ ...data, imei } as any);
        setSuccess('Mapping created successfully');
      }
      // Refresh mappings
      const mappings = await getUnitIOMappingsByImei(imei);
      setTrackerMappings(mappings);
      setShowEditor(false);
      setEditingTemplate(null);
    } catch (err: any) {
      setError(err.message);
    }
  };
  
  // Delete tracker mapping
  const handleDeleteTrackerMapping = async (id: number) => {
    if (!selectedUnit) return;
    if (!confirm('Are you sure you want to delete this mapping?')) return;
    
    try {
      await deleteUnitIOMapping(parseInt(selectedUnit.imei), id);
      setTrackerMappings((prev) => prev.filter((m) => m.id !== id));
      setSuccess('Mapping deleted');
    } catch (err: any) {
      setError(err.message);
    }
  };
  
  // Delete all tracker mappings
  const handleDeleteAllTrackerMappings = async () => {
    if (!selectedUnit) return;
    if (!confirm(`Are you sure you want to delete ALL mappings for this tracker?`)) return;
    
    try {
      const result = await deleteAllUnitIOMappings(parseInt(selectedUnit.imei));
      setTrackerMappings([]);
      setSuccess(`Deleted ${result.count} mappings`);
    } catch (err: any) {
      setError(err.message);
    }
  };
  
  // Apply device template to tracker
  const handleApplyTemplate = async () => {
    if (!selectedUnit || !selectedDevice) return;
    
    try {
      const result = await applyDeviceTemplate(parseInt(selectedUnit.imei), selectedDevice, overwrite);
      setSuccess(result.message);
      // Refresh mappings
      const mappings = await getUnitIOMappingsByImei(parseInt(selectedUnit.imei));
      setTrackerMappings(mappings);
      setShowApplyTemplateModal(false);
    } catch (err: any) {
      setError(err.message);
    }
  };
  
  // Copy mappings from another tracker
  const handleCopyMappings = async () => {
    if (!selectedUnit || !sourceImei) return;
    
    try {
      const result = await copyUnitMappings(parseInt(sourceImei), parseInt(selectedUnit.imei), overwrite);
      setSuccess(result.message);
      // Refresh mappings
      const mappings = await getUnitIOMappingsByImei(parseInt(selectedUnit.imei));
      setTrackerMappings(mappings);
      setShowCopyMappingsModal(false);
      setSourceImei('');
    } catch (err: any) {
      setError(err.message);
    }
  };
  
  // Clear notifications after 3 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

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
            <h1 className="text-2xl font-bold text-slate-800">IO Mappings</h1>
            <p className="text-slate-500 text-sm">Configure device IO templates and tracker-specific mappings</p>
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            {success}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-4 p-1 bg-slate-100 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('device-templates')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all",
              activeTab === 'device-templates' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
            )}
          >
            <Cpu className="w-4 h-4" />
            Device Templates
          </button>
          <button
            onClick={() => setActiveTab('tracker-mappings')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all",
              activeTab === 'tracker-mappings' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
            )}
          >
            <Radio className="w-4 h-4" />
            Tracker Mappings
          </button>
        </div>

        {/* DEVICE TEMPLATES TAB */}
        {activeTab === 'device-templates' && (
          <>
            {/* Device Selection */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 shadow-sm">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Device Type</label>
                  <select
                    value={selectedDevice || ''}
                    onChange={(e) => setSelectedDevice(e.target.value || null)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
                  >
                    <option value="">Select device...</option>
                    {deviceTypes.map((dt) => (
                      <option key={dt.device_name} value={dt.device_name}>{dt.device_name}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => { setEditingTemplate(null); setShowEditor(true); }}
                  disabled={!selectedDevice}
                  className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Template
                </button>
                {deviceTemplates.length > 0 && (
                  <button
                    onClick={handleDeleteAllDeviceTemplates}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete All
                  </button>
                )}
              </div>
            </div>

            {/* Templates List */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : deviceTemplates.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">IO ID</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Type</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Value</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Target</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Alarm</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Notify</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {deviceTemplates.map((template) => (
                        <tr key={template.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono text-slate-800">{template.io_id}</td>
                          <td className="px-4 py-3">
                            <div className="text-slate-800 font-medium">{template.io_name}</div>
                            {template.value_name && <div className="text-slate-500 text-xs">{template.value_name}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              "px-2 py-0.5 rounded text-xs font-medium",
                              template.io_type === 2 ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                            )}>
                              {IO_TYPES[template.io_type]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{template.value ?? 'N/A'}</td>
                          <td className="px-4 py-3 text-slate-600">{TARGET_TYPES[template.target]}</td>
                          <td className="px-4 py-3">
                            {template.is_alarm ? (
                              <span className="text-amber-600">Yes</span>
                            ) : (
                              <span className="text-slate-400">No</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              {template.is_sms ? <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">SMS</span> : null}
                              {template.is_email ? <span className="text-xs bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">Email</span> : null}
                              {template.is_call ? <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Call</span> : null}
                              {!template.is_sms && !template.is_email && !template.is_call && <span className="text-slate-400">-</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => { setEditingTemplate(template); setShowEditor(true); }}
                                className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                                title="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteDeviceTemplate(template.id!)}
                                className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Cpu className="w-12 h-12 mb-3 opacity-50" />
                  <p className="text-sm">
                    {selectedDevice ? 'No IO templates configured for this device' : 'Select a device to view templates'}
                  </p>
                </div>
              )}
              {/* Footer */}
              {deviceTemplates.length > 0 && (
                <div className="p-2 border-t border-slate-200 bg-slate-50 text-center">
                  <span className="text-xs text-slate-500">{deviceTemplates.length} template{deviceTemplates.length !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* TRACKER MAPPINGS TAB */}
        {activeTab === 'tracker-mappings' && (
          <>
            {/* Unit Selection */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 shadow-sm">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Search Tracker (IMEI or Mega ID)</label>
                  <input
                    type="text"
                    value={unitSearch}
                    onChange={(e) => {
                      setUnitSearch(e.target.value);
                      handleUnitSearch(e.target.value);
                    }}
                    placeholder="Enter IMEI or Mega ID..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
                  />
                  {units.length > 0 && !selectedUnit && (
                    <div className="absolute mt-1 w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                      {units.map((unit) => (
                        <button
                          key={unit.id}
                          onClick={() => {
                            setSelectedUnit(unit);
                            setUnitSearch(unit.imei);
                            setUnits([]);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-slate-50 text-sm"
                        >
                          <div className="font-medium text-slate-800">{unit.imei}</div>
                          <div className="text-xs text-slate-500">{unit.mega_id} • {unit.device_name}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedUnit && (
                  <div className="flex-1 min-w-[200px]">
                    <div className="px-3 py-2 bg-primary-50 border border-primary-200 rounded-lg">
                      <div className="text-sm font-medium text-primary-800">{selectedUnit.imei}</div>
                      <div className="text-xs text-primary-600">{selectedUnit.mega_id} • {selectedUnit.device_name}</div>
                    </div>
                  </div>
                )}
                {selectedUnit && (
                  <button
                    onClick={() => {
                      setSelectedUnit(null);
                      setUnitSearch('');
                      setTrackerMappings([]);
                    }}
                    className="p-2 text-slate-500 hover:text-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              {/* Action Buttons */}
              {selectedUnit && (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-200">
                  <button
                    onClick={() => { setEditingTemplate(null); setShowEditor(true); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add Mapping
                  </button>
                  <button
                    onClick={() => { setOverwrite(false); setShowApplyTemplateModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
                  >
                    <FileInput className="w-4 h-4" />
                    Apply Device Template
                  </button>
                  <button
                    onClick={() => { setOverwrite(false); setSourceImei(''); setShowCopyMappingsModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
                  >
                    <Copy className="w-4 h-4" />
                    Copy from Tracker
                  </button>
                  {trackerMappings.length > 0 && (
                    <button
                      onClick={handleDeleteAllTrackerMappings}
                      className="flex items-center gap-1.5 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete All
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Mappings List */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : trackerMappings.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">IO ID</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Type</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Value</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Target</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Time Window</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Alarm</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Notify</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {trackerMappings.map((mapping) => (
                        <tr key={mapping.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono text-slate-800">{mapping.io_id}</td>
                          <td className="px-4 py-3">
                            <div className="text-slate-800 font-medium">{mapping.io_name}</div>
                            {mapping.value_name && <div className="text-slate-500 text-xs">{mapping.value_name}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              "px-2 py-0.5 rounded text-xs font-medium",
                              mapping.io_type === 2 ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                            )}>
                              {IO_TYPES[mapping.io_type]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{mapping.value ?? 'N/A'}</td>
                          <td className="px-4 py-3 text-slate-600">{TARGET_TYPES[mapping.target]}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs font-mono">
                            {mapping.start_time ? timeUTCToLocal(mapping.start_time, workingTimezone) : '-'} - {mapping.end_time ? timeUTCToLocal(mapping.end_time, workingTimezone) : '-'}
                          </td>
                          <td className="px-4 py-3">
                            {mapping.is_alarm ? (
                              <span className="text-amber-600">Yes</span>
                            ) : (
                              <span className="text-slate-400">No</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              {mapping.is_sms ? <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">SMS</span> : null}
                              {mapping.is_email ? <span className="text-xs bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">Email</span> : null}
                              {mapping.is_call ? <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Call</span> : null}
                              {!mapping.is_sms && !mapping.is_email && !mapping.is_call && <span className="text-slate-400">-</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => { setEditingTemplate(mapping); setShowEditor(true); }}
                                className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                                title="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteTrackerMapping(mapping.id!)}
                                className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Radio className="w-12 h-12 mb-3 opacity-50" />
                  <p className="text-sm">
                    {selectedUnit ? 'No IO mappings configured for this tracker' : 'Search and select a tracker to view mappings'}
                  </p>
                </div>
              )}
              {/* Footer */}
              {trackerMappings.length > 0 && (
                <div className="p-2 border-t border-slate-200 bg-slate-50 text-center">
                  <span className="text-xs text-slate-500">{trackerMappings.length} mapping{trackerMappings.length !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* IO Mapping Editor Modal */}
      {showEditor && (
        <IOMappingEditorModal
          mapping={editingTemplate}
          isDeviceTemplate={activeTab === 'device-templates'}
          deviceName={selectedDevice}
          onSave={activeTab === 'device-templates' ? handleSaveDeviceTemplate : handleSaveTrackerMapping}
          onClose={() => { setShowEditor(false); setEditingTemplate(null); }}
        />
      )}

      {/* Apply Template Modal */}
      {showApplyTemplateModal && selectedUnit && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 max-w-md w-full shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Apply Device Template</h3>
              <button onClick={() => setShowApplyTemplateModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Apply IO template from a device type to tracker <strong>{selectedUnit.imei}</strong>
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Device Type</label>
                <select
                  value={selectedDevice || ''}
                  onChange={(e) => setSelectedDevice(e.target.value || null)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
                >
                  <option value="">Select device...</option>
                  {deviceTypes.map((dt) => (
                    <option key={dt.device_name} value={dt.device_name}>{dt.device_name}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500"
                />
                <span className="text-sm text-slate-700">Overwrite existing mappings</span>
              </label>
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button onClick={() => setShowApplyTemplateModal(false)} className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-100">
                Cancel
              </button>
              <button
                onClick={handleApplyTemplate}
                disabled={!selectedDevice}
                className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600 disabled:bg-slate-300"
              >
                Apply Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Mappings Modal */}
      {showCopyMappingsModal && selectedUnit && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 max-w-md w-full shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Copy from Another Tracker</h3>
              <button onClick={() => setShowCopyMappingsModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Copy IO mappings from another tracker to <strong>{selectedUnit.imei}</strong>
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Source Tracker IMEI</label>
                <input
                  type="text"
                  value={sourceImei}
                  onChange={(e) => setSourceImei(e.target.value)}
                  placeholder="Enter source IMEI..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500"
                />
                <span className="text-sm text-slate-700">Overwrite existing mappings</span>
              </label>
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button onClick={() => setShowCopyMappingsModal(false)} className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-100">
                Cancel
              </button>
              <button
                onClick={handleCopyMappings}
                disabled={!sourceImei}
                className="px-3 py-1.5 bg-sky-500 text-white rounded-lg text-sm hover:bg-sky-600 disabled:bg-slate-300"
              >
                Copy Mappings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// IO Mapping Editor Modal Component
interface IOMappingEditorModalProps {
  mapping: DeviceIOMapping | UnitIOMapping | null;
  workingTimezone?: string;
  isDeviceTemplate: boolean;
  deviceName: string | null;
  onSave: (data: any) => void;
  onClose: () => void;
}

function IOMappingEditorModal({ mapping, workingTimezone = '', isDeviceTemplate, deviceName, onSave, onClose }: IOMappingEditorModalProps) {
  const [formData, setFormData] = useState({
    io_id: mapping?.io_id || 1,
    io_multiplier: mapping?.io_multiplier || 1.0,
    io_type: mapping?.io_type || 2,
    io_name: mapping?.io_name || '',
    value_name: mapping?.value_name || '',
    value: mapping?.value ?? '',
    target: mapping?.target || 0,
    column_name: mapping?.column_name || '',
    start_time: mapping?.start_time ? timeUTCToLocal(mapping.start_time, workingTimezone) : '00:00',
    end_time: mapping?.end_time ? timeUTCToLocal(mapping.end_time, workingTimezone) : '23:59',
    is_alarm: mapping?.is_alarm || 0,
    is_sms: mapping?.is_sms || 0,
    is_email: mapping?.is_email || 0,
    is_call: mapping?.is_call || 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      value: formData.value === '' ? null : Number(formData.value),
      start_time: timeLocalToUTC(formData.start_time + ':00', workingTimezone),
      end_time: timeLocalToUTC(formData.end_time + ':59', workingTimezone),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-2xl w-full shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-slate-800">
            {mapping ? 'Edit' : 'Add'} {isDeviceTemplate ? 'Device Template' : 'Tracker Mapping'}
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* IO ID */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">IO ID *</label>
              <input
                type="number"
                min="1"
                value={formData.io_id}
                onChange={(e) => setFormData({ ...formData, io_id: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
                required
              />
            </div>

            {/* IO Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">IO Type *</label>
              <select
                value={formData.io_type}
                onChange={(e) => setFormData({ ...formData, io_type: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
              >
                <option value={2}>Digital</option>
                <option value={3}>Analog</option>
              </select>
            </div>

            {/* IO Name */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">IO Name *</label>
              <input
                type="text"
                value={formData.io_name}
                onChange={(e) => setFormData({ ...formData, io_name: e.target.value })}
                placeholder="e.g., Ignition, Door Sensor"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
                required
              />
            </div>

            {/* Value Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Value Name</label>
              <input
                type="text"
                value={formData.value_name}
                onChange={(e) => setFormData({ ...formData, value_name: e.target.value })}
                placeholder="e.g., ON, OFF"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
              />
            </div>

            {/* Value */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Value Trigger</label>
              <input
                type="number"
                step="any"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                placeholder="Leave empty for analog"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
              />
            </div>

            {/* Multiplier */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Multiplier</label>
              <input
                type="number"
                step="any"
                value={formData.io_multiplier}
                onChange={(e) => setFormData({ ...formData, io_multiplier: parseFloat(e.target.value) || 1.0 })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
              />
            </div>

            {/* Target */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Target *</label>
              <select
                value={formData.target}
                onChange={(e) => setFormData({ ...formData, target: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
              >
                <option value={0}>Column</option>
                <option value={1}>Status</option>
                <option value={2}>Both</option>
                <option value={3}>JSONB</option>
              </select>
            </div>

            {/* Column Name */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Column Name</label>
              <input
                type="text"
                value={formData.column_name}
                onChange={(e) => setFormData({ ...formData, column_name: e.target.value })}
                placeholder="Target column name in database"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
              />
            </div>

            {/* Time Window */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Time</label>
              <input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">End Time</label>
              <input
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
              />
            </div>
          </div>

          {/* Alarm & Notifications */}
          <div className="pt-4 border-t border-slate-200">
            <p className="text-sm font-medium text-slate-700 mb-3">Alarm & Notifications</p>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_alarm === 1}
                  onChange={(e) => setFormData({ ...formData, is_alarm: e.target.checked ? 1 : 0 })}
                  className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-sm text-slate-700">Enable Alarm</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_sms === 1}
                  onChange={(e) => setFormData({ ...formData, is_sms: e.target.checked ? 1 : 0 })}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-700">SMS</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_email === 1}
                  onChange={(e) => setFormData({ ...formData, is_email: e.target.checked ? 1 : 0 })}
                  className="w-4 h-4 rounded border-slate-300 text-sky-500 focus:ring-sky-500"
                />
                <span className="text-sm text-slate-700">Email</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_call === 1}
                  onChange={(e) => setFormData({ ...formData, is_call: e.target.checked ? 1 : 0 })}
                  className="w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-sm text-slate-700">Call</span>
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600"
            >
              {mapping ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
