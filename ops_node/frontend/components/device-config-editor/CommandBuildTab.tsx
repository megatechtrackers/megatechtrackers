'use client';

import { useState } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { CommandParameter } from '@/lib/api';
import { createEmptyCommandParameter } from './types';

interface CommandBuildTabProps {
  commandParameters: CommandParameter[];
  separator: string;
  onChange: (parameters: CommandParameter[]) => void;
}

export default function CommandBuildTab({
  commandParameters,
  separator,
  onChange,
}: CommandBuildTabProps) {
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const addCommandParameter = (type: '1' | '2' = '2') => {
    const newId = commandParameters.length > 0 
      ? Math.max(...commandParameters.map(p => p.ParameterID)) + 1 
      : 1;
    onChange([...commandParameters, createEmptyCommandParameter(newId, type)]);
  };

  const removeCommandParameter = (index: number) => {
    onChange(commandParameters.filter((_, i) => i !== index));
  };

  const updateCommandParameter = (index: number, field: keyof CommandParameter, value: any) => {
    const updated = [...commandParameters];
    if (field === 'ParameterType') {
      updated[index] = { 
        ...updated[index], 
        [field]: value,
        ParameterTypeDesc: value === '1' ? 'Fixed' : 'Configurable',
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    onChange(updated);
  };

  const toggleJsonEditor = () => {
    if (showJsonEditor) {
      // Parse JSON back to command parameters
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
      // Convert command parameters to JSON for editing
      setJsonText(JSON.stringify(commandParameters, null, 2));
      setJsonError(null);
    }
    setShowJsonEditor(!showJsonEditor);
  };

  // Build command preview
  const startChar = commandParameters
    .filter(p => p.ParameterType === '1' && p.ParameterName?.toLowerCase() === 'startcharacter')
    .map(p => p.DefaultValue || '')[0] || '';
  const commandId = commandParameters
    .filter(p => p.ParameterType === '1' && p.ParameterName?.toLowerCase() === 'commandid')
    .map(p => p.DefaultValue || '')[0] || '';
  const endChar = commandParameters
    .filter(p => p.ParameterType === '1' && p.ParameterName?.toLowerCase() === 'endcharacter')
    .map(p => p.DefaultValue || '')[0] || '';
  const configurableParams = commandParameters
    .filter(p => p.ParameterType === '2')
    .map(p => `[${p.ParameterName || 'value'}]`)
    .join(separator || ',');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Define parameters for command building (StartCharacter, CommandID, configurable values, EndCharacter).
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={toggleJsonEditor}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-sm font-medium transition-colors text-slate-700"
          >
            {showJsonEditor ? 'Visual Editor' : 'JSON Editor'}
          </button>
          {!showJsonEditor && (
            <>
              <button
                type="button"
                onClick={() => addCommandParameter('1')}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 border border-slate-300 rounded-lg text-sm font-medium transition-colors text-slate-700"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Fixed</span>
                <span className="sm:hidden">Fixed</span>
              </button>
              <button
                type="button"
                onClick={() => addCommandParameter('2')}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 rounded-lg text-sm font-medium transition-colors text-white shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Configurable</span>
                <span className="sm:hidden">Config</span>
              </button>
            </>
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
            rows={15}
            className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-800 font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter JSON array of command parameters..."
          />
          <p className="text-xs text-slate-500">
            Format: {`[{"ParameterID": 1, "ParameterType": "1", "ParameterTypeDesc": "Fixed", "ParameterName": "StartCharacter", "DefaultValue": "CMD"}]`}
          </p>
        </div>
      ) : (
        <>
          {commandParameters.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50">
              No command parameters. Add Fixed (StartCharacter, CommandID, EndCharacter) and Configurable parameters.
            </div>
          ) : (
            <div className="space-y-2">
              {commandParameters.map((param, index) => (
                <div
                  key={index}
                  className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 border rounded-lg ${
                    param.ParameterType === '1'
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-primary-50 border-primary-200'
                  }`}
                >
                  <GripVertical className="w-4 h-4 text-slate-400 hidden sm:block" />
                  <div className="flex items-center gap-2 sm:gap-3 flex-1">
                    <select
                      value={param.ParameterType}
                      onChange={(e) => updateCommandParameter(index, 'ParameterType', e.target.value)}
                      className="px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs w-24 sm:w-28 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="1">Fixed</option>
                      <option value="2">Configurable</option>
                    </select>
                    <input
                      type="text"
                      value={param.ParameterName || ''}
                      onChange={(e) => updateCommandParameter(index, 'ParameterName', e.target.value)}
                      placeholder="Parameter name"
                      className="flex-1 min-w-0 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <input
                      type="text"
                      value={param.DefaultValue || ''}
                      onChange={(e) => updateCommandParameter(index, 'DefaultValue', e.target.value || null)}
                      placeholder="Default value"
                      className="w-24 sm:w-32 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 text-sm font-mono focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <span className="text-xs text-slate-500 w-16 hidden sm:inline">ID: {param.ParameterID}</span>
                    <button
                      type="button"
                      onClick={() => removeCommandParameter(index)}
                      className="p-1.5 hover:bg-red-100 rounded text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Command Preview */}
          {commandParameters.length > 0 && (
            <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <label className="block text-sm font-medium text-slate-700 mb-2">Command Structure Preview</label>
              <div className="font-mono text-sm text-primary-600 break-all">
                {startChar}
                {commandId}
                <span className="text-amber-600">{configurableParams}</span>
                {endChar}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
