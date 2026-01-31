'use client';

import { Trash2 } from 'lucide-react';
import { SubDetail } from '@/lib/api';
import { EditorMetadata } from './types';

interface SubDetailEditorProps {
  subDetail: SubDetail;
  index: number;
  metadata: EditorMetadata | null;
  onUpdate: (field: keyof SubDetail, value: any) => void;
  onRemove: () => void;
}

export default function SubDetailEditor({
  subDetail,
  index,
  metadata,
  onUpdate,
  onRemove,
}: SubDetailEditorProps) {
  return (
    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-slate-500">
          SubDetail #{subDetail.SubDetailID}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 hover:bg-red-100 rounded text-red-500"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      
      {/* Row 1: Control, CmdText, CmdValue, ActualValue */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Control</label>
          <select
            value={subDetail.Control || 'TextBox'}
            onChange={(e) => onUpdate('Control', e.target.value)}
            className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {metadata?.controlTypes.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">CmdText (Label)</label>
          <input
            type="text"
            value={subDetail.CmdText || ''}
            onChange={(e) => onUpdate('CmdText', e.target.value || null)}
            placeholder="Display text"
            className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">CmdValue</label>
          <input
            type="text"
            value={subDetail.CmdValue || ''}
            onChange={(e) => onUpdate('CmdValue', e.target.value || null)}
            placeholder="Command value"
            className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">ActualValue</label>
          <input
            type="text"
            value={subDetail.ActualValue || ''}
            onChange={(e) => onUpdate('ActualValue', e.target.value || null)}
            placeholder="Actual value"
            className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>
      
      {/* Row 2: MinValue, MaxValue, ControlWidth, Description */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Min Value</label>
          <input
            type="text"
            value={subDetail.MinValue || ''}
            onChange={(e) => onUpdate('MinValue', e.target.value || null)}
            placeholder="Min"
            className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Max Value</label>
          <input
            type="text"
            value={subDetail.MaxValue || ''}
            onChange={(e) => onUpdate('MaxValue', e.target.value || null)}
            placeholder="Max"
            className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Control Width</label>
          <input
            type="number"
            value={subDetail.ControlWidth || ''}
            onChange={(e) => onUpdate('ControlWidth', e.target.value ? parseInt(e.target.value) : null)}
            placeholder="Width px"
            className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Description</label>
          <input
            type="text"
            value={subDetail.Description || ''}
            onChange={(e) => onUpdate('Description', e.target.value || null)}
            placeholder="Description"
            className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>
    </div>
  );
}
