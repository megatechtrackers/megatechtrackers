'use client';

import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { ConfigParameter, SubDetail } from '@/lib/api';
import { EditorMetadata, createEmptyParameter, createEmptySubDetail } from './types';
import SubDetailEditor from './SubDetailEditor';

interface ParametersTabProps {
  parameters: ConfigParameter[];
  metadata: EditorMetadata | null;
  onChange: (parameters: ConfigParameter[]) => void;
}

export default function ParametersTab({
  parameters,
  metadata,
  onChange,
}: ParametersTabProps) {
  const [expandedParams, setExpandedParams] = useState<Set<number>>(new Set([0]));
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const toggleParam = (index: number) => {
    setExpandedParams(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const addParameter = () => {
    const newId = parameters.length > 0 
      ? Math.max(...parameters.map(p => p.ParameterID)) + 1 
      : 1;
    onChange([...parameters, createEmptyParameter(newId)]);
    setExpandedParams(prev => new Set([...Array.from(prev), parameters.length]));
  };

  const removeParameter = (index: number) => {
    onChange(parameters.filter((_, i) => i !== index));
  };

  const updateParameter = (index: number, field: keyof ConfigParameter, value: any) => {
    const updated = [...parameters];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const addSubDetail = (paramIndex: number) => {
    const param = parameters[paramIndex];
    const subDetails = param.SubDetails || [];
    const newId = subDetails.length > 0 
      ? Math.max(...subDetails.map(s => s.SubDetailID)) + 1 
      : 1;
    const updated = [...parameters];
    updated[paramIndex] = {
      ...param,
      SubDetails: [...subDetails, createEmptySubDetail(newId)],
    };
    onChange(updated);
  };

  const removeSubDetail = (paramIndex: number, subIndex: number) => {
    const param = parameters[paramIndex];
    const updated = [...parameters];
    updated[paramIndex] = {
      ...param,
      SubDetails: (param.SubDetails || []).filter((_, i) => i !== subIndex),
    };
    onChange(updated);
  };

  const updateSubDetail = (paramIndex: number, subIndex: number, field: keyof SubDetail, value: any) => {
    const updated = [...parameters];
    const param = updated[paramIndex];
    const subDetails = [...(param.SubDetails || [])];
    subDetails[subIndex] = { ...subDetails[subIndex], [field]: value };
    updated[paramIndex] = { ...param, SubDetails: subDetails };
    onChange(updated);
  };

  const toggleJsonEditor = () => {
    if (showJsonEditor) {
      // Parse JSON back to parameters
      try {
        const parsed = JSON.parse(jsonText);
        if (Array.isArray(parsed)) {
          onChange(parsed);
          setJsonError(null);
        } else {
          setJsonError('Must be a JSON array');
          return;
        }
      } catch (e) {
        setJsonError('Invalid JSON: ' + (e as Error).message);
        return;
      }
    } else {
      // Convert parameters to JSON for editing
      setJsonText(JSON.stringify(parameters, null, 2));
      setJsonError(null);
    }
    setShowJsonEditor(!showJsonEditor);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Define configurable parameters and their UI controls (SubDetails).
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={toggleJsonEditor}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-sm font-medium transition-colors text-slate-700"
          >
            {showJsonEditor ? 'Visual Editor' : 'JSON Editor'}
          </button>
          {!showJsonEditor && (
            <button
              type="button"
              onClick={addParameter}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 rounded-lg text-sm font-medium transition-colors text-white shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Parameter</span>
              <span className="sm:hidden">Add</span>
            </button>
          )}
        </div>
      </div>

      {/* JSON Editor Mode */}
      {showJsonEditor ? (
        <div className="space-y-2">
          {jsonError && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {jsonError}
            </div>
          )}
          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setJsonError(null);
            }}
            rows={20}
            className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-800 font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter JSON array of parameters..."
          />
          <p className="text-xs text-slate-500">
            Format: {`[{"ParameterID": 1, "ParameterName": "...", "ParameterType": "2", "ParameterValue": "...", "SubDetails": [...]}]`}
          </p>
        </div>
      ) : (
        <>
          {parameters.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50">
              No parameters defined. Click "Add Parameter" to create one.
            </div>
          ) : (
            <div className="space-y-3">
              {parameters.map((param, paramIndex) => (
                <div key={paramIndex} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  {/* Parameter Header */}
                  <div
                    className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => toggleParam(paramIndex)}
                  >
                    <GripVertical className="w-4 h-4 text-slate-400 hidden sm:block" />
                    {expandedParams.has(paramIndex) ? (
                      <ChevronUp className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                    <span className="flex-1 font-medium text-slate-800 truncate">
                      {param.ParameterName || `Parameter ${paramIndex + 1}`}
                    </span>
                    <span className="text-xs text-slate-500 bg-slate-200 px-2 py-0.5 rounded hidden sm:inline">
                      {param.SubDetails?.length || 0} SubDetail(s)
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeParameter(paramIndex); }}
                      className="p-1.5 hover:bg-red-100 rounded text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Parameter Body */}
                  {expandedParams.has(paramIndex) && (
                    <div className="p-3 sm:p-4 space-y-4 border-t border-slate-200">
                      {/* Parameter Fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Parameter Name</label>
                          <input
                            type="text"
                            value={param.ParameterName || ''}
                            onChange={(e) => updateParameter(paramIndex, 'ParameterName', e.target.value)}
                            placeholder="e.g., CommandValue"
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Default Value</label>
                          <input
                            type="text"
                            value={param.ParameterValue || ''}
                            onChange={(e) => updateParameter(paramIndex, 'ParameterValue', e.target.value || null)}
                            placeholder="Default value"
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Parameter ID</label>
                          <input
                            type="number"
                            value={param.ParameterID}
                            onChange={(e) => updateParameter(paramIndex, 'ParameterID', parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          />
                        </div>
                      </div>

                      {/* SubDetails */}
                      <div className="border-t border-slate-200 pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-sm font-medium text-slate-700">SubDetails (UI Options)</label>
                          <button
                            type="button"
                            onClick={() => addSubDetail(paramIndex)}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors text-slate-700"
                          >
                            <Plus className="w-3 h-3" />
                            Add SubDetail
                          </button>
                        </div>

                        {(param.SubDetails?.length || 0) === 0 ? (
                          <div className="text-xs text-slate-500 text-center py-4 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50">
                            No SubDetails. Add one for UI control definition.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {param.SubDetails?.map((sub, subIndex) => (
                              <SubDetailEditor
                                key={subIndex}
                                subDetail={sub}
                                index={subIndex}
                                metadata={metadata}
                                onUpdate={(field, value) => updateSubDetail(paramIndex, subIndex, field, value)}
                                onRemove={() => removeSubDetail(paramIndex, subIndex)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
