"use client";

import { useState, useEffect, useRef } from "react";

interface ScheduleControlProps {
  value?: string;
  onChange: (value: string) => void;
  description?: string;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_FLAGS = [1, 2, 4, 8, 16, 32, 64];
const TIME_SLOTS = ["00 min", "10 min", "20 min", "30 min", "40 min", "50 min"];

export default function ScheduleControl({
  value,
  onChange,
  description,
}: ScheduleControlProps) {
  const [dayChecks, setDayChecks] = useState<boolean[]>(
    Array(7).fill(false)
  );
  const [timeGrid, setTimeGrid] = useState<boolean[][]>(
    Array(6)
      .fill(null)
      .map(() => Array(18).fill(false))
  );
  
  // Track if we're updating from prop change (to avoid loops)
  const isUpdatingFromProp = useRef(false);
  const lastPropValue = useRef<string | undefined>(undefined);

  // Parse hex command to state - only when prop value changes
  useEffect(() => {
    // Only parse if value actually changed from outside
    if (value !== lastPropValue.current && value && value.length >= 38) {
      isUpdatingFromProp.current = true;
      lastPropValue.current = value;
      
      try {
        const timeArray: number[] = [];
        for (let i = 0; i < 19; i++) {
          const hexByte = value.substring(i * 2, i * 2 + 2);
          timeArray.push(parseInt(hexByte, 16));
        }

        // First byte: day selection
        const weekDay = timeArray[0];
        const newDayChecks = DAY_FLAGS.map((tag) => (weekDay & tag) === tag);
        setDayChecks(newDayChecks);

        // Remaining 18 bytes: time grid
        const newGrid: boolean[][] = Array(6)
          .fill(null)
          .map(() => Array(18).fill(false));
        let row = 0;
        let col = 0;

        for (let i = 1; i < timeArray.length; i++) {
          let weekDayByte = timeArray[i];
          for (let j = 0; j < 8; j++) {
            if (row < 6 && col < 18) {
              newGrid[row][col] = (weekDayByte & 1) === 1;
            }
            weekDayByte = weekDayByte >> 1;
            if (row < 5) {
              row++;
            } else {
              row = 0;
              col++;
            }
          }
        }
        setTimeGrid(newGrid);
      } catch (e) {
        console.error("Error parsing ScheduleControl command:", e);
      }
      
      // Reset flag after state updates are scheduled
      setTimeout(() => {
        isUpdatingFromProp.current = false;
      }, 0);
    }
  }, [value]);

  // Generate hex command from state
  const generateCommand = (): string => {
    const timeArray: number[] = new Array(19).fill(0);

    // First byte: day selection
    let weekDay = 0;
    dayChecks.forEach((checked, index) => {
      if (checked) {
        weekDay = weekDay | DAY_FLAGS[index];
      }
    });
    timeArray[0] = weekDay;

    // Remaining 18 bytes: time grid
    let byteIndex = 1;
    let bitIndex = 0;
    let currentByte = 0;

    for (let colIdx = 0; colIdx < 18; colIdx++) {
      for (let rowIdx = 0; rowIdx < 6; rowIdx++) {
        if (timeGrid[rowIdx][colIdx]) {
          currentByte = currentByte | (1 << bitIndex);
        }
        bitIndex++;
        if (bitIndex === 8) {
          timeArray[byteIndex] = currentByte;
          byteIndex++;
          currentByte = 0;
          bitIndex = 0;
        }
      }
    }
    if (bitIndex > 0 && byteIndex < 19) {
      timeArray[byteIndex] = currentByte;
    }

    // Convert to hex string
    let hexCommand = "";
    timeArray.forEach((a) => {
      const temp = a.toString(16).toUpperCase();
      hexCommand += temp.length < 2 ? "0" + temp : temp;
    });

    return hexCommand;
  };

  // Handle user changes to days
  const handleDayChange = (index: number, checked: boolean) => {
    const newChecks = [...dayChecks];
    newChecks[index] = checked;
    setDayChecks(newChecks);
    
    // Generate and emit new command
    const timeArray: number[] = new Array(19).fill(0);
    let weekDay = 0;
    newChecks.forEach((c, i) => {
      if (c) weekDay = weekDay | DAY_FLAGS[i];
    });
    timeArray[0] = weekDay;
    
    let byteIndex = 1, bitIndex = 0, currentByte = 0;
    for (let colIdx = 0; colIdx < 18; colIdx++) {
      for (let rowIdx = 0; rowIdx < 6; rowIdx++) {
        if (timeGrid[rowIdx][colIdx]) currentByte = currentByte | (1 << bitIndex);
        bitIndex++;
        if (bitIndex === 8) {
          timeArray[byteIndex++] = currentByte;
          currentByte = 0;
          bitIndex = 0;
        }
      }
    }
    if (bitIndex > 0 && byteIndex < 19) timeArray[byteIndex] = currentByte;
    
    const hexCommand = timeArray.map(a => a.toString(16).toUpperCase().padStart(2, '0')).join('');
    lastPropValue.current = hexCommand;
    onChange(hexCommand);
  };

  // Handle user changes to time grid
  const handleTimeGridChange = (row: number, col: number, checked: boolean) => {
    const newGrid = timeGrid.map((r) => [...r]);
    newGrid[row][col] = checked;
    setTimeGrid(newGrid);
    
    // Generate and emit new command
    const timeArray: number[] = new Array(19).fill(0);
    let weekDay = 0;
    dayChecks.forEach((c, i) => {
      if (c) weekDay = weekDay | DAY_FLAGS[i];
    });
    timeArray[0] = weekDay;
    
    let byteIndex = 1, bitIndex = 0, currentByte = 0;
    for (let colIdx = 0; colIdx < 18; colIdx++) {
      for (let rowIdx = 0; rowIdx < 6; rowIdx++) {
        if (newGrid[rowIdx][colIdx]) currentByte = currentByte | (1 << bitIndex);
        bitIndex++;
        if (bitIndex === 8) {
          timeArray[byteIndex++] = currentByte;
          currentByte = 0;
          bitIndex = 0;
        }
      }
    }
    if (bitIndex > 0 && byteIndex < 19) timeArray[byteIndex] = currentByte;
    
    const hexCommand = timeArray.map(a => a.toString(16).toUpperCase().padStart(2, '0')).join('');
    lastPropValue.current = hexCommand;
    onChange(hexCommand);
  };

  const setAllDays = (checked: boolean) => {
    const newChecks = Array(7).fill(checked);
    setDayChecks(newChecks);
    
    // Generate and emit
    const timeArray: number[] = new Array(19).fill(0);
    let weekDay = 0;
    newChecks.forEach((c, i) => {
      if (c) weekDay = weekDay | DAY_FLAGS[i];
    });
    timeArray[0] = weekDay;
    
    let byteIndex = 1, bitIndex = 0, currentByte = 0;
    for (let colIdx = 0; colIdx < 18; colIdx++) {
      for (let rowIdx = 0; rowIdx < 6; rowIdx++) {
        if (timeGrid[rowIdx][colIdx]) currentByte = currentByte | (1 << bitIndex);
        bitIndex++;
        if (bitIndex === 8) {
          timeArray[byteIndex++] = currentByte;
          currentByte = 0;
          bitIndex = 0;
        }
      }
    }
    if (bitIndex > 0 && byteIndex < 19) timeArray[byteIndex] = currentByte;
    
    const hexCommand = timeArray.map(a => a.toString(16).toUpperCase().padStart(2, '0')).join('');
    lastPropValue.current = hexCommand;
    onChange(hexCommand);
  };

  const setAllTimes = (checked: boolean) => {
    const newGrid = Array(6).fill(null).map(() => Array(18).fill(checked));
    setTimeGrid(newGrid);
    
    // Generate and emit
    const timeArray: number[] = new Array(19).fill(0);
    let weekDay = 0;
    dayChecks.forEach((c, i) => {
      if (c) weekDay = weekDay | DAY_FLAGS[i];
    });
    timeArray[0] = weekDay;
    
    let byteIndex = 1, bitIndex = 0, currentByte = 0;
    for (let colIdx = 0; colIdx < 18; colIdx++) {
      for (let rowIdx = 0; rowIdx < 6; rowIdx++) {
        if (newGrid[rowIdx][colIdx]) currentByte = currentByte | (1 << bitIndex);
        bitIndex++;
        if (bitIndex === 8) {
          timeArray[byteIndex++] = currentByte;
          currentByte = 0;
          bitIndex = 0;
        }
      }
    }
    if (bitIndex > 0 && byteIndex < 19) timeArray[byteIndex] = currentByte;
    
    const hexCommand = timeArray.map(a => a.toString(16).toUpperCase().padStart(2, '0')).join('');
    lastPropValue.current = hexCommand;
    onChange(hexCommand);
  };

  return (
    <div className="space-y-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
      {description && (
        <p className="text-sm text-slate-600">{description}</p>
      )}

      {/* Day Selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-600">
            Days of Week
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setAllDays(true)}
              className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-all"
            >
              Set All
            </button>
            <button
              onClick={() => setAllDays(false)}
              className="px-2 py-1 text-xs bg-slate-200 text-slate-600 rounded hover:bg-slate-300 transition-all"
            >
              Clear All
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {DAYS.map((day, index) => (
            <label key={index} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={dayChecks[index]}
                onChange={(e) => handleDayChange(index, e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-700">{day}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Time Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-600">
            Time Schedule (Hours 1-18)
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setAllTimes(true)}
              className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-all"
            >
              Set All
            </button>
            <button
              onClick={() => setAllTimes(false)}
              className="px-2 py-1 text-xs bg-slate-200 text-slate-600 rounded hover:bg-slate-300 transition-all"
            >
              Clear All
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="px-2 py-1 bg-slate-100 text-slate-600 text-left sticky left-0 border border-slate-200">
                  Time
                </th>
                {Array.from({ length: 18 }, (_, i) => (
                  <th
                    key={i}
                    className="px-1 py-1 bg-slate-100 text-slate-600 text-center min-w-[28px] border border-slate-200"
                  >
                    {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map((slot, rowIndex) => (
                <tr key={rowIndex}>
                  <td className="px-2 py-1 bg-slate-100 text-slate-700 font-medium sticky left-0 border border-slate-200 whitespace-nowrap">
                    {slot}
                  </td>
                  {Array.from({ length: 18 }, (_, colIndex) => (
                    <td key={colIndex} className="p-0 border border-slate-200">
                      <input
                        type="checkbox"
                        checked={timeGrid[rowIndex][colIndex]}
                        onChange={(e) =>
                          handleTimeGridChange(rowIndex, colIndex, e.target.checked)
                        }
                        className="w-full h-6 cursor-pointer accent-blue-600 bg-white"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
