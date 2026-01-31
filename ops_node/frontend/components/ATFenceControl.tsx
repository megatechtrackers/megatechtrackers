"use client";

import { useState, useEffect } from "react";

interface ATFenceControlProps {
  value?: string; // Command string from LastConfiguration (32 characters: 8+8+8+8)
  onChange: (command: string) => void;
  description?: string;
}

export default function ATFenceControl({
  value,
  onChange,
  description,
}: ATFenceControlProps) {
  const [startLat, setStartLat] = useState("");
  const [startLong, setStartLong] = useState("");
  const [endLat, setEndLat] = useState("");
  const [endLong, setEndLong] = useState("");

  // Parse command string to coordinates (format: 32 chars = 8+8+8+8)
  // MissionOct08 logic: Convert.ToInt32(s_lat.Substring(0, 3)) + "." + (Convert.ToDouble(s_lat.Substring(3, 5)) / 60.0)
  useEffect(() => {
    if (value && value.length >= 32) {
      try {
        const sLat = value.substring(0, 8);
        const sLng = value.substring(8, 16);
        const lLat = value.substring(16, 24);
        const lLng = value.substring(24, 32);

        // Convert from format: 0DDMMSSSS to DD.MMSSSS
        // Format: first 3 digits = degrees, next 5 digits = minutes*60 (as integer)
        const parseCoordinate = (coord: string): string => {
          const degrees = parseInt(coord.substring(0, 3));
          const minutesInt = parseInt(coord.substring(3, 8)); // Next 5 digits
          const minutes = minutesInt / 60.0;
          const total = degrees + minutes;

          // Format: DD.MMSSSS (where MMSSSS is the decimal part)
          const totalStr = total.toString();
          if (totalStr.includes(".")) {
            const [intPart, decPart] = totalStr.split(".");
            return `${intPart}.${decPart.padEnd(6, "0").substring(0, 6)}`;
          }
          return totalStr + ".000000";
        };

        setStartLat(parseCoordinate(sLat));
        setStartLong(parseCoordinate(sLng));
        setEndLat(parseCoordinate(lLat));
        setEndLong(parseCoordinate(lLng));
      } catch (e) {
        console.error("Error parsing ATFence command:", e);
      }
    }
  }, [value]);

  // Generate command string from coordinates (format: DD.MMSSSS -> 0DDMMSSSS)
  // MissionOct08 logic: ("0" + degrees + (minutes*60 < 10 ? "0" : "") + (minutes*60).toString()).replace(".", "").substring(0, 8)
  const generateCommand = (
    lat: string,
    lng: string,
    eLat: string,
    eLng: string
  ): string => {
    try {
      const formatCoordinate = (coord: string): string => {
        const num = parseFloat(coord);
        if (isNaN(num)) return "00000000";

        // Get first 2 digits as degrees (for lat) or first 3 digits (for lng)
        const coordStr = coord.toString();
        const dotIndex = coordStr.indexOf(".");
        const intPart = dotIndex >= 0 ? coordStr.substring(0, dotIndex) : coordStr;
        const degrees = parseInt(intPart);

        // Calculate minutes from decimal part
        const decimalPart = num - degrees;
        const minutesTotal = decimalPart * 60;
        const minutesStr =
          minutesTotal < 10
            ? "0" + minutesTotal.toString().replace(".", "")
            : minutesTotal.toString().replace(".", "");

        // Format: 0 + degrees (2-3 digits) + minutes (as integer, no decimal)
        // Then remove dot and take first 8 characters
        let result = "0" + degrees.toString() + minutesStr;
        result = result.replace(".", "");
        result = result.substring(0, 8);

        // Pad to 8 digits if needed
        return result.padEnd(8, "0");
      };

      const sLat = formatCoordinate(lat);
      const sLng = formatCoordinate(lng);
      const lLat = formatCoordinate(eLat);
      const lLng = formatCoordinate(eLng);

      return sLat + sLng + lLat + lLng;
    } catch (e) {
      return "";
    }
  };

  // Update command when coordinates change
  useEffect(() => {
    if (startLat && startLong && endLat && endLong) {
      const command = generateCommand(startLat, startLong, endLat, endLong);
      if (command.length === 32) {
        onChange(command);
      }
    }
  }, [startLat, startLong, endLat, endLong, onChange]);

  return (
    <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
      {description && (
        <label className="text-sm font-semibold text-slate-700 block mb-2">
          {description}
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">
            Start Latitude
          </label>
          <input
            type="text"
            value={startLat}
            onChange={(e) => setStartLat(e.target.value)}
            placeholder="DD.MMSSSS"
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-800 placeholder-slate-400"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">
            Start Longitude
          </label>
          <input
            type="text"
            value={startLong}
            onChange={(e) => setStartLong(e.target.value)}
            placeholder="DDD.MMSSSS"
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-800 placeholder-slate-400"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">
            End Latitude
          </label>
          <input
            type="text"
            value={endLat}
            onChange={(e) => setEndLat(e.target.value)}
            placeholder="DD.MMSSSS"
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-800 placeholder-slate-400"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">
            End Longitude
          </label>
          <input
            type="text"
            value={endLong}
            onChange={(e) => setEndLong(e.target.value)}
            placeholder="DDD.MMSSSS"
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-800 placeholder-slate-400"
          />
        </div>
      </div>
    </div>
  );
}
