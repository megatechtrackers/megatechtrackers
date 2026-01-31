"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

interface Operator {
  name: string;
  code: string;
}

interface OperatorControlProps {
  value?: string;
  onChange: (value: string) => void;
  description?: string;
}

// Pakistani mobile operators
const OPERATORS: Operator[] = [
  { name: "Warid", code: "41007" },
  { name: "Mobilink", code: "41001" },
  { name: "Telenor", code: "41006" },
  { name: "Zong", code: "41004" },
  { name: "Ufone", code: "41003" },
];

export default function OperatorControl({
  value,
  onChange,
  description,
}: OperatorControlProps) {
  const [selectedOperators, setSelectedOperators] = useState<boolean[]>(
    Array(OPERATORS.length).fill(false)
  );
  const [orderedOperators, setOrderedOperators] = useState<Operator[]>([]);
  
  const lastPropValue = useRef<string | undefined>(undefined);

  // Parse command string to state - only when prop value changes
  useEffect(() => {
    if (value !== lastPropValue.current && value) {
      lastPropValue.current = value;
      try {
        const codes = value
          .split(",")
          .map((c) => c.trim())
          .filter((c) => c);
        const newSelected = OPERATORS.map((op) => codes.includes(op.code));
        setSelectedOperators(newSelected);

        // Build ordered list from codes
        const ordered: Operator[] = [];
        codes.forEach((code) => {
          const op = OPERATORS.find((o) => o.code === code);
          if (op) ordered.push(op);
        });
        setOrderedOperators(ordered);
      } catch (e) {
        console.error("Error parsing OperatorControl command:", e);
      }
    }
  }, [value]);

  // Emit change to parent
  const emitChange = (newOrdered: Operator[]) => {
    const cmd = newOrdered.map((op) => op.code).join(",");
    lastPropValue.current = cmd;
    onChange(cmd);
  };

  const handleOperatorToggle = (index: number, checked: boolean) => {
    const newSelected = [...selectedOperators];
    newSelected[index] = checked;
    setSelectedOperators(newSelected);

    const operator = OPERATORS[index];
    let newOrdered: Operator[];
    if (checked) {
      if (!orderedOperators.find((op) => op.code === operator.code)) {
        newOrdered = [...orderedOperators, operator];
      } else {
        newOrdered = orderedOperators;
      }
    } else {
      newOrdered = orderedOperators.filter((op) => op.code !== operator.code);
    }
    setOrderedOperators(newOrdered);
    emitChange(newOrdered);
  };

  const moveOperator = (index: number, direction: "up" | "down") => {
    let newOrdered = [...orderedOperators];
    if (direction === "up" && index > 0) {
      [newOrdered[index - 1], newOrdered[index]] = [
        newOrdered[index],
        newOrdered[index - 1],
      ];
    } else if (direction === "down" && index < orderedOperators.length - 1) {
      [newOrdered[index], newOrdered[index + 1]] = [
        newOrdered[index + 1],
        newOrdered[index],
      ];
    } else {
      return; // No change
    }
    setOrderedOperators(newOrdered);
    emitChange(newOrdered);
  };

  return (
    <div className="space-y-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
      {description && (
        <p className="text-sm text-slate-600">{description}</p>
      )}

      {/* Available Operators */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-600 block">
          Available Operators
        </label>
        <div className="space-y-2">
          {OPERATORS.map((operator, index) => (
            <label
              key={index}
              className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                selectedOperators[index]
                  ? "bg-blue-50 border-blue-300"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedOperators[index]}
                onChange={(e) => handleOperatorToggle(index, e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500"
              />
              <span className="flex-1 text-sm font-medium text-slate-800">
                {operator.name}
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {operator.code}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Selected Operators (Ordered) */}
      {orderedOperators.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-600 block">
            Selected Operators (Priority Order)
          </label>
          <div className="space-y-1">
            {orderedOperators.map((operator, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-lg border border-blue-200"
              >
                <span className="text-xs font-bold text-blue-600 w-6">
                  {index + 1}.
                </span>
                <span className="flex-1 text-sm font-medium text-slate-800">
                  {operator.name}
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  {operator.code}
                </span>
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveOperator(index, "up")}
                    disabled={index === 0}
                    className="p-0.5 text-blue-600 hover:bg-blue-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="Move up"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => moveOperator(index, "down")}
                    disabled={index === orderedOperators.length - 1}
                    className="p-0.5 text-blue-600 hover:bg-blue-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="Move down"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
