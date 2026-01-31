'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, FileInput, Copy, RotateCcw, X, AlertCircle, CheckCircle } from 'lucide-react';
import {
  getUnitIOMappingsByImei,
  createUnitIOMapping,
  updateUnitIOMapping,
  deleteUnitIOMapping,
  deleteAllUnitIOMappings,
  applyDeviceTemplate,
  copyUnitMappings,
  resetToDeviceDefaults,
  getDeviceTypes,
  UnitIOMapping,
  DeviceType,
  Unit,
} from '@/lib/api';
import { cn } from '@/lib/utils';

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

interface UnitIOMappingTabProps {
  unit: Unit;
}

export default function UnitIOMappingTab({ unit }: UnitIOMappingTabProps) {
  const [mappings, setMappings] = useState<UnitIOMapping[]>([]);
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Modal state
  const [showEditor, setShowEditor] = useState(false);
  const [editingMapping, setEditingMapping] = useState<UnitIOMapping | null>(null);
  const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string>(unit.device_name);
  const [sourceImei, setSourceImei] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  
  const imei = parseInt(unit.imei);
  
  // Load mappings
  const loadMappings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getUnitIOMappingsByImei(imei);
      setMappings(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [imei]);
  
  // Load initial data
  useEffect(() => {
    loadMappings();
    getDeviceTypes().then(setDeviceTypes).catch(console.error);
  }, [loadMappings]);
  
  // Clear notifications
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);
  
  // Save mapping
  const handleSave = async (data: Partial<UnitIOMapping>) => {
    try {
      if (editingMapping?.id) {
        await updateUnitIOMapping(imei, editingMapping.id, data);
        setSuccess('Mapping updated');
      } else {
        await createUnitIOMapping({ ...data, imei } as any);
        setSuccess('Mapping created');
      }
      await loadMappings();
      setShowEditor(false);
      setEditingMapping(null);
    } catch (err: any) {
      setError(err.message);
    }
  };
  
  // Delete mapping
  const handleDelete = async (id: number) => {
    if (!confirm('Delete this mapping?')) return;
    try {
      await deleteUnitIOMapping(imei, id);
      setMappings(prev => prev.filter(m => m.id !== id));
      setSuccess('Mapping deleted');
    } catch (err: any) {
      setError(err.message);
    }
  };
  
  // Delete all mappings
  const handleDeleteAll = async () => {
    if (!confirm('Delete ALL mappings for this tracker?')) return;
    try {
      const result = await deleteAllUnitIOMappings(imei);
      setMappings([]);
      setSuccess(`Deleted ${result.count} mappings`);
    } catch (err: any) {
      setError(err.message);
    }
  };
  
  // Apply device template
  const handleApplyTemplate = async () => {
    try {
      const result = await applyDeviceTemplate(imei, selectedDevice, overwrite);
      setSuccess(result.message);
      await loadMappings();
      setShowApplyTemplateModal(false);
    } catch (err: any) {
      setError(err.message);
    }
  };
  
  // Copy from another tracker
  const handleCopyMappings = async () => {
    if (!sourceImei) return;
    try {
      const result = await copyUnitMappings(parseInt(sourceImei), imei, overwrite);
      setSuccess(result.message);
      await loadMappings();
      setShowCopyModal(false);
      setSourceImei('');
    } catch (err: any) {
      setError(err.message);
    }
  };
  
  // Reset to device defaults
  const handleResetToDevice = async () => {
    if (!confirm('Reset all mappings to device defaults? This will delete all custom mappings.')) return;
    try {
      const result = await resetToDeviceDefaults(imei);
      setSuccess(result.message);
      await loadMappings();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Notifications */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          {success}
        </div>
      )}
      
      {/* Action Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setEditingMapping(null); setShowEditor(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Mapping
          </button>
          <button
            onClick={() => { setOverwrite(false); setShowApplyTemplateModal(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-all"
          >
            <FileInput className="w-4 h-4" />
            Apply Template
          </button>
          <button
            onClick={() => { setOverwrite(false); setSourceImei(''); setShowCopyModal(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium transition-all"
          >
            <Copy className="w-4 h-4" />
            Copy from Tracker
          </button>
          <button
            onClick={handleResetToDevice}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Device
          </button>
          <button
            onClick={loadMappings}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-all"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Refresh
          </button>
          {mappings.length > 0 && (
            <button
              onClick={handleDeleteAll}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-all ml-auto"
            >
              <Trash2 className="w-4 h-4" />
              Delete All
            </button>
          )}
        </div>
      </div>
      
      {/* Mappings Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : mappings.length > 0 ? (
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
                {mappings.map((mapping) => (
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
                      {mapping.start_time?.slice(0, 5)} - {mapping.end_time?.slice(0, 5)}
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
                          onClick={() => { setEditingMapping(mapping); setShowEditor(true); }}
                          className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(mapping.id!)}
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
            <FileInput className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">No IO mappings configured</p>
            <p className="text-xs mt-1">Click "Apply Template" to use device defaults</p>
          </div>
        )}
        {mappings.length > 0 && (
          <div className="p-2 border-t border-slate-200 bg-slate-50 text-center">
            <span className="text-xs text-slate-500">{mappings.length} mapping{mappings.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
      
      {/* Editor Modal */}
      {showEditor && (
        <IOMappingEditor
          mapping={editingMapping}
          onSave={handleSave}
          onClose={() => { setShowEditor(false); setEditingMapping(null); }}
        />
      )}
      
      {/* Apply Template Modal */}
      {showApplyTemplateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 max-w-md w-full shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Apply Device Template</h3>
              <button onClick={() => setShowApplyTemplateModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Device Type</label>
                <select
                  value={selectedDevice}
                  onChange={(e) => setSelectedDevice(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
                >
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
              <button onClick={handleApplyTemplate} className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600">
                Apply Template
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Copy from Tracker Modal */}
      {showCopyModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 max-w-md w-full shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Copy from Tracker</h3>
              <button onClick={() => setShowCopyModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
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
              <button onClick={() => setShowCopyModal(false)} className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-100">
                Cancel
              </button>
              <button onClick={handleCopyMappings} disabled={!sourceImei} className="px-3 py-1.5 bg-sky-500 text-white rounded-lg text-sm hover:bg-sky-600 disabled:bg-slate-300">
                Copy Mappings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline Editor Component
function IOMappingEditor({ 
  mapping, 
  onSave, 
  onClose 
}: { 
  mapping: UnitIOMapping | null;
  onSave: (data: Partial<UnitIOMapping>) => void;
  onClose: () => void;
}) {
  const [formData, setFormData] = useState({
    io_id: mapping?.io_id || 1,
    io_multiplier: mapping?.io_multiplier || 1.0,
    io_type: mapping?.io_type || 2,
    io_name: mapping?.io_name || '',
    value_name: mapping?.value_name || '',
    value: mapping?.value ?? '',
    target: mapping?.target || 0,
    column_name: mapping?.column_name || '',
    start_time: mapping?.start_time?.slice(0, 5) || '00:00',
    end_time: mapping?.end_time?.slice(0, 5) || '23:59',
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
      start_time: formData.start_time + ':00',
      end_time: formData.end_time + ':59',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-2xl w-full shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-slate-800">
            {mapping ? 'Edit' : 'Add'} IO Mapping
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Column Name</label>
              <input
                type="text"
                value={formData.column_name}
                onChange={(e) => setFormData({ ...formData, column_name: e.target.value })}
                placeholder="Target column name"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
              />
            </div>
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

          <div className="flex gap-2 justify-end pt-4 border-t border-slate-200">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600">
              {mapping ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
