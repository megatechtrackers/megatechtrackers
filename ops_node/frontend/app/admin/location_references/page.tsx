'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ArrowLeft, Pencil, Trash2, Search, Upload, Download, X, MapPin, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import {
  getLocationReferences,
  getLocationReferencesCount,
  createLocationReference,
  updateLocationReference,
  deleteLocationReference,
  deleteAllLocationReferences,
  getLocationReferencesExportUrl,
  importLocationReferences,
  LocationReference,
} from '@/lib/api';
import { cn } from '@/lib/utils';

export default function LocationReferencesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <LocationReferencesPageContent />
    </Suspense>
  );
}

function LocationReferencesPageContent() {
  const router = useRouter();
  const [locationReferences, setLocationReferences] = useState<LocationReference[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Search and pagination
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 50;
  
  // Modal state
  const [showEditor, setShowEditor] = useState(false);
  const [editingRef, setEditingRef] = useState<LocationReference | null>(null);
  const [showImport, setShowImport] = useState(false);
  
  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importUpdateExisting, setImportUpdateExisting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; created: number; updated: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Load references
  const loadLocationReferences = useCallback(async () => {
    try {
      setLoading(true);
      const [data, countResult] = await Promise.all([
        getLocationReferences(search || undefined, pageSize, page * pageSize),
        getLocationReferencesCount(search || undefined)
      ]);
      setLocationReferences(data);
      setTotalCount(countResult.count);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, page]);
  
  useEffect(() => {
    loadLocationReferences();
  }, [loadLocationReferences]);
  
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
  
  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  
  // Save location reference
  const handleSave = async (data: Partial<LocationReference>) => {
    try {
      if (editingRef?.id) {
        await updateLocationReference(editingRef.id, data);
        setSuccess('Location reference updated');
      } else {
        await createLocationReference(data as any);
        setSuccess('Location reference created');
      }
      await loadLocationReferences();
      setShowEditor(false);
      setEditingRef(null);
    } catch (err: any) {
      setError(err.message);
    }
  };
  
  // Delete location reference
  const handleDelete = async (id: number) => {
    if (!confirm('Delete this location reference?')) return;
    try {
      await deleteLocationReference(id);
      setLocationReferences(prev => prev.filter(r => r.id !== id));
      setTotalCount(prev => prev - 1);
      setSuccess('Location reference deleted');
    } catch (err: any) {
      setError(err.message);
    }
  };
  
  // Delete all
  const handleDeleteAll = async () => {
    if (!confirm('Delete ALL location references? This cannot be undone.')) return;
    try {
      const result = await deleteAllLocationReferences();
      setLocationReferences([]);
      setTotalCount(0);
      setSuccess(`Deleted ${result.count} location references`);
    } catch (err: any) {
      setError(err.message);
    } 
  };
  
  // Import
  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importLocationReferences(importFile, importUpdateExisting);
      setImportResult(result);
      if (result.created > 0 || result.updated > 0) {
        await loadLocationReferences();
      }
    } catch (err: any) {
      setImportResult({ success: false, created: 0, updated: 0, errors: [err.message] });
    } finally {
      setImporting(false);
    }
  };
  
  const totalPages = Math.ceil(totalCount / pageSize);

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
            <h1 className="text-2xl font-bold text-slate-800">Location References</h1>
            <p className="text-slate-500 text-sm">Manage POI and location reference locations</p>
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

        {/* Action Bar */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search location references..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
              />
            </div>
            
            {/* Actions */}
            <button
              onClick={() => { setEditingRef(null); setShowEditor(true); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Location Reference
            </button>
            <button
              onClick={() => { setImportFile(null); setImportResult(null); setShowImport(true); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
            <a
              href={getLocationReferencesExportUrl()}
              download
              className="flex items-center gap-1.5 px-3 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
            >
              <Download className="w-4 h-4" />
              Export
            </a>
            <button
              onClick={loadLocationReferences}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-all"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </button>
            {locationReferences.length > 0 && (
              <button
                onClick={handleDeleteAll}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
                Delete All Location References
              </button>
            )}
          </div>
          
          {/* Stats */}
          <div className="mt-3 flex items-center gap-4 text-sm text-slate-500">
            <span>{totalCount.toLocaleString()} total location reference{totalCount !== 1 ? 's' : ''}</span>
            {search && <span>• filtered by "{search}"</span>}
          </div>
        </div>

        {/* Location References Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : locationReferences.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">ID</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">Reference</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">Latitude</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">Longitude</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {locationReferences.map((ref) => (
                      <tr key={ref.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-slate-600">{ref.id}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-primary-500" />
                            <span className="text-slate-800 font-medium">{ref.reference}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600">{ref.latitude.toFixed(6)}</td>
                        <td className="px-4 py-3 font-mono text-slate-600">{ref.longitude.toFixed(6)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => { setEditingRef(ref); setShowEditor(true); }}
                              className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(ref.id)}
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
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                  <span className="text-sm text-slate-500">
                    Page {page + 1} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <MapPin className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-sm">{search ? 'No location references match your search' : 'No location references configured'}</p>
              <button
                onClick={() => { setEditingRef(null); setShowEditor(true); }}
                className="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                + Add your first location reference
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Editor Modal */}
      {showEditor && (
        <LocationReferenceEditor
          locationReference={editingRef}
          onSave={handleSave}
          onClose={() => { setShowEditor(false); setEditingRef(null); }}
        />
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 max-w-md w-full shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Import Location References</h3>
              <button onClick={() => setShowImport(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
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

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={importUpdateExisting}
                  onChange={(e) => setImportUpdateExisting(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500"
                />
                <span className="text-sm text-slate-700">Update existing by ID</span>
              </label>

              <button
                onClick={handleImport}
                disabled={!importFile || importing}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium transition-all"
              >
                {importing ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {importing ? 'Importing...' : 'Import'}
              </button>

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
                          <ul className="list-disc list-inside text-amber-700 text-xs mt-1 max-h-24 overflow-y-auto">
                            {importResult.errors.slice(0, 5).map((err, i) => <li key={i}>{err}</li>)}
                            {importResult.errors.length > 5 && <li>...and {importResult.errors.length - 5} more</li>}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600">
                <p className="font-medium mb-1">CSV Format:</p>
                <p>id, latitude, longitude, reference</p>
                <p className="text-slate-500 mt-1">ID is optional for new records</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Location Reference Editor Modal
function LocationReferenceEditor({
  locationReference,
  onSave,
  onClose 
}: {
  locationReference: LocationReference | null;
  onSave: (data: Partial<LocationReference>) => void;
  onClose: () => void;
}) {
  const [formData, setFormData] = useState({
    id: locationReference?.id?.toString() || '',
    latitude: locationReference?.latitude?.toString() || '',
    longitude: locationReference?.longitude?.toString() || '',
    reference: locationReference?.reference || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: formData.id ? parseInt(formData.id) : undefined,
      latitude: parseFloat(formData.latitude),
      longitude: parseFloat(formData.longitude),
      reference: formData.reference,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-slate-800">
            {locationReference ? 'Edit Location Reference' : 'Add Location Reference'}
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!locationReference && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ID (optional)</label>
              <input
                type="number"
                value={formData.id}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                placeholder="Auto-generated if empty"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reference Name *</label>
            <input
              type="text"
              value={formData.reference}
              onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
              placeholder="e.g., Main Office, Warehouse A"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Latitude *</label>
              <input
                type="number"
                step="any"
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                placeholder="-90 to 90"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Longitude *</label>
              <input
                type="number"
                step="any"
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                placeholder="-180 to 180"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
                required
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t border-slate-200">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600">
              {locationReference ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
