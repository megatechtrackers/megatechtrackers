"use client";

import { useState, useEffect, useRef } from "react";

interface ZoneControlProps {
  value?: string;
  onChange: (value: string) => void;
  description?: string;
}

const SHAPE_OPTIONS = ["Circle", "Rectangle"];
const PRIORITY_OPTIONS = ["0", "1", "2", "3", "4", "5", "6", "7"];
const ENTER_EXIT_OPTIONS = ["Disable", "Enable"];

export default function ZoneControl({
  value,
  onChange,
  description,
}: ZoneControlProps) {
  const [shape, setShape] = useState(0);
  const [priority, setPriority] = useState(0);
  const [enter, setEnter] = useState(0);
  const [exit, setExit] = useState(0);
  
  const lastPropValue = useRef<string | undefined>(undefined);

  // Parse command string to state - only when prop value changes
  useEffect(() => {
    if (value !== lastPropValue.current && value) {
      lastPropValue.current = value;
      try {
        const n = parseInt(value);
        if (!isNaN(n)) {
          setShape(n & 1);
          setPriority((n >> 1) & 7);
          setEnter((n >> 4) & 1);
          setExit((n >> 5) & 1);
        }
      } catch (e) {
        console.error("Error parsing ZoneControl command:", e);
      }
    }
  }, [value]);

  // Generate command from values and emit
  const emitChange = (s: number, p: number, en: number, ex: number) => {
    let n = 0;
    n = n | s;
    n = n | (p << 1);
    n = n | (en << 4);
    n = n | (ex << 5);
    const cmd = n.toString();
    lastPropValue.current = cmd;
    onChange(cmd);
  };

  return (
    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
      {description && (
        <p className="text-sm text-slate-600 mb-4">{description}</p>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Shape */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1.5">
            Shape
          </label>
          <select
            value={shape}
            onChange={(e) => {
              const newVal = parseInt(e.target.value);
              setShape(newVal);
              emitChange(newVal, priority, enter, exit);
            }}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SHAPE_OPTIONS.map((option, index) => (
              <option key={index} value={index}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {/* Priority */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1.5">
            Priority
          </label>
          <select
            value={priority}
            onChange={(e) => {
              const newVal = parseInt(e.target.value);
              setPriority(newVal);
              emitChange(shape, newVal, enter, exit);
            }}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PRIORITY_OPTIONS.map((option, index) => (
              <option key={index} value={index}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {/* Enter */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1.5">
            On Enter
          </label>
          <select
            value={enter}
            onChange={(e) => {
              const newVal = parseInt(e.target.value);
              setEnter(newVal);
              emitChange(shape, priority, newVal, exit);
            }}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {ENTER_EXIT_OPTIONS.map((option, index) => (
              <option key={index} value={index}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {/* Exit */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1.5">
            On Exit
          </label>
          <select
            value={exit}
            onChange={(e) => {
              const newVal = parseInt(e.target.value);
              setExit(newVal);
              emitChange(shape, priority, enter, newVal);
            }}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {ENTER_EXIT_OPTIONS.map((option, index) => (
              <option key={index} value={index}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
