"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Radio,
  ChevronRight,
  Loader2,
  Signal,
  Settings,
  Plus,
  Upload,
  Download,
  Cpu,
  MapPin,
} from "lucide-react";
import { searchUnits, getDeviceTypes, createUnit, Unit, UnitCreate, DeviceType } from "@/lib/api";
import { ToastContainer, useToast } from "@/components/Toast";

// Module-level cache to prevent multiple loads across remounts
let deviceTypesCache: DeviceType[] | null = null;
let deviceTypesLoading = false;

export default function HomePage() {
  const router = useRouter();
  const { addToast, toasts, dismissToast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [units, setUnits] = useState<Unit[]>([]);
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>(deviceTypesCache || []);
  const [loading, setLoading] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [showNewUnitModal, setShowNewUnitModal] = useState(false);
  const [newUnitData, setNewUnitData] = useState<UnitCreate>({
    imei: "",
    device_name: "",
    sim_no: "",
    mega_id: "",
    ffid: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  
  // Ref to track if this component instance has already loaded
  const hasLoadedRef = useRef(false);

  // Load device types on mount (only once)
  useEffect(() => {
    // If we already have cached data, use it immediately - no state update needed if already set
    if (deviceTypesCache && deviceTypes.length === 0) {
      setDeviceTypes(deviceTypesCache);
      return;
    }
    
    // If cache exists and state is already populated, do nothing
    if (deviceTypesCache && deviceTypes.length > 0) {
      return;
    }

    // Prevent duplicate loads from this component instance
    if (hasLoadedRef.current || deviceTypesLoading) {
      return;
    }

    // Mark as loading
    hasLoadedRef.current = true;
    deviceTypesLoading = true;

    getDeviceTypes()
      .then((data) => {
        deviceTypesCache = data;
        deviceTypesLoading = false;
        setDeviceTypes(data);
      })
      .catch((error) => {
        console.error("Failed to load device types:", error);
        deviceTypesLoading = false;
        hasLoadedRef.current = false; // Allow retry on error
        addToast({
          type: "error",
          title: "Failed to Load Device Types",
          message: "Could not load device types. Please refresh the page.",
          duration: 6000,
        });
      });
  }, []); // Empty deps - only run on mount

  // Search units - show some by default if no search
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const query = searchQuery.length >= 2 ? searchQuery : undefined;
        const deviceName = selectedDevice || undefined;
        // Limit to 6 results for grid display (2x3 on mobile, 3x2 on desktop)
        const data = await searchUnits(query, deviceName, 6);
        setUnits(data);
      } catch (error) {
        console.error("Failed to load units:", error);
        addToast({
          type: "error",
          title: "Failed to Load Units",
          message: error instanceof Error ? error.message : "Could not load units. Please try again.",
          duration: 6000,
        });
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, selectedDevice]); // Only depend on searchQuery and selectedDevice

  const loadUnits = useCallback(async (query?: string, deviceName?: string) => {
    setLoading(true);
    try {
      // Limit to 6 results for grid display (2x3 on mobile, 3x2 on desktop)
      const data = await searchUnits(query || undefined, deviceName || undefined, 6);
      setUnits(data);
    } catch (error) {
      console.error("Failed to load units:", error);
      addToast({
        type: "error",
        title: "Failed to Load Units",
        message: error instanceof Error ? error.message : "Could not load units. Please try again.",
        duration: 6000,
      });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  const handleUnitClick = (imei: string) => {
    router.push(`/unit/${imei}`);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!newUnitData.imei.trim()) {
      errors.imei = "IMEI is required";
    } else if (newUnitData.imei.trim().length < 5) {
      errors.imei = "IMEI must be at least 5 characters";
    }
    
    if (!newUnitData.device_name.trim()) {
      errors.device_name = "Device Config is required";
    }
    
    if (!newUnitData.sim_no?.trim()) {
      errors.sim_no = "SIM Number is required";
    }
    
    if (!newUnitData.mega_id?.trim()) {
      errors.mega_id = "Mega ID is required";
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateUnit = async () => {
    if (!validateForm()) {
      return;
    }
    
    try {
      await createUnit({
        ...newUnitData,
        imei: newUnitData.imei.trim(),
        device_name: newUnitData.device_name.trim(),
        sim_no: newUnitData.sim_no?.trim() || null,
        mega_id: newUnitData.mega_id?.trim() || null,
        ffid: newUnitData.ffid?.trim() || null,
      });
      setShowNewUnitModal(false);
      setNewUnitData({
        imei: "",
        device_name: "",
        sim_no: "",
        mega_id: "",
        ffid: "",
      });
      setFormErrors({});
      loadUnits(searchQuery, selectedDevice);
      addToast({
        type: "success",
        title: "Unit Created",
        message: `Successfully created unit: ${newUnitData.device_name}`,
        duration: 5000,
      });
    } catch (error) {
      console.error("Failed to create unit:", error);
      addToast({
        type: "error",
        title: "Failed to Create Unit",
        message: error instanceof Error ? error.message : "Could not create unit. Please try again.",
        duration: 6000,
      });
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-6 sm:mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-2 sm:p-2.5 bg-slate-800 rounded-xl shadow-lg border border-slate-700">
              <Radio className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
                Device Service
              </h1>
              <p className="text-slate-500 text-xs">
                Device Configuration System
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="max-w-6xl mx-auto mb-6 sm:mb-8">
        <h2 className="text-sm font-semibold mb-3 text-slate-600 uppercase tracking-wide">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 sm:gap-3">
          <button
            onClick={() => router.push('/admin/devices')}
            className="p-3 sm:p-4 bg-white hover:bg-indigo-50 rounded-xl border border-slate-200 hover:border-indigo-300 transition-all text-left group shadow-sm"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg group-hover:bg-indigo-200 transition-all">
                <Settings className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-medium text-slate-800 text-xs sm:text-sm">Device Configs</h3>
                <p className="text-xs text-slate-500 hidden sm:block">Manage templates</p>
              </div>
            </div>
          </button>
          <button
            onClick={() => router.push('/admin/io-mappings')}
            className="p-3 sm:p-4 bg-white hover:bg-violet-50 rounded-xl border border-slate-200 hover:border-violet-300 transition-all text-left group shadow-sm"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-violet-100 rounded-lg group-hover:bg-violet-200 transition-all">
                <Cpu className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <h3 className="font-medium text-slate-800 text-xs sm:text-sm">IO Mappings</h3>
                <p className="text-xs text-slate-500 hidden sm:block">Configure I/O</p>
              </div>
            </div>
          </button>
          <button
            onClick={() => router.push('/admin/location_references')}
            className="p-3 sm:p-4 bg-white hover:bg-rose-50 rounded-xl border border-slate-200 hover:border-rose-300 transition-all text-left group shadow-sm"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-rose-100 rounded-lg group-hover:bg-rose-200 transition-all">
                <MapPin className="w-4 h-4 text-rose-600" />
              </div>
              <div>
                <h3 className="font-medium text-slate-800 text-xs sm:text-sm">Location References</h3>
                <p className="text-xs text-slate-500 hidden sm:block">Manage POI</p>
              </div>
            </div>
          </button>
          <button
            onClick={() => setShowNewUnitModal(true)}
            className="p-3 sm:p-4 bg-white hover:bg-emerald-50 rounded-xl border border-slate-200 hover:border-emerald-300 transition-all text-left group shadow-sm"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg group-hover:bg-emerald-200 transition-all">
                <Plus className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-medium text-slate-800 text-xs sm:text-sm">Add Unit</h3>
                <p className="text-xs text-slate-500 hidden sm:block">Register new</p>
              </div>
            </div>
          </button>
          <button
            onClick={() => router.push('/admin/devices?tab=import')}
            className="p-3 sm:p-4 bg-white hover:bg-amber-50 rounded-xl border border-slate-200 hover:border-amber-300 transition-all text-left group shadow-sm"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-amber-100 rounded-lg group-hover:bg-amber-200 transition-all">
                <Upload className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <h3 className="font-medium text-slate-800 text-xs sm:text-sm">Import</h3>
                <p className="text-xs text-slate-500 hidden sm:block">From CSV</p>
              </div>
            </div>
          </button>
          <button
            onClick={() => router.push('/admin/devices?tab=export')}
            className="p-3 sm:p-4 bg-white hover:bg-cyan-50 rounded-xl border border-slate-200 hover:border-cyan-300 transition-all text-left group shadow-sm"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-cyan-100 rounded-lg group-hover:bg-cyan-200 transition-all">
                <Download className="w-4 h-4 text-cyan-600" />
              </div>
              <div>
                <h3 className="font-medium text-slate-800 text-xs sm:text-sm">Export</h3>
                <p className="text-xs text-slate-500 hidden sm:block">To CSV</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Search Section */}
      <div className="max-w-6xl mx-auto">
        <h2 className="text-sm font-semibold mb-3 text-slate-600 uppercase tracking-wide">
          Search Units
        </h2>
        <div className="bg-white rounded-xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by IMEI, SIM, or MegaID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all placeholder:text-slate-400 text-slate-800"
              />
            </div>

            {/* Device Config Filter */}
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer w-full sm:w-auto sm:min-w-[200px] text-slate-800"
            >
              <option value="">All Devices</option>
              {deviceTypes.map((dt) => (
                <option key={dt.device_name} value={dt.device_name}>
                  {dt.device_name} ({dt.config_count})
                </option>
              ))}
            </select>
          </div>

          {/* Results */}
          <div className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
              </div>
            ) : units.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {units.slice(0, 6).map((unit) => (
                  <button
                    key={unit.imei}
                    onClick={() => handleUnitClick(unit.imei)}
                    className="w-full p-3 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 hover:border-primary-300 transition-all group flex items-center gap-3 text-left"
                  >
                    <div className="p-2 bg-primary-50 rounded-lg group-hover:bg-primary-100 transition-all shrink-0">
                      <Signal className="w-4 h-4 text-primary-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 font-mono text-sm truncate">
                        {unit.imei}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {unit.device_name}
                        {unit.sim_no && ` • ${unit.sim_no}`}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 text-sm">
                {searchQuery.length >= 2 || selectedDevice ? "No units found" : "Enter search term or select device to find units"}
              </div>
            )}
            {units.length >= 6 && (
              <p className="text-xs text-slate-400 text-center mt-3">
                Showing top results. Refine your search for more specific results.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* New Unit Modal - All fields required */}
      {showNewUnitModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 sm:p-6 max-w-md w-full shadow-2xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Add New Unit</h2>
            <p className="text-xs text-slate-500 mb-4">All fields are required.</p>
            <div className="space-y-3">
              {/* IMEI */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  IMEI *
                </label>
                <input
                  type="text"
                  value={newUnitData.imei}
                  onChange={(e) =>
                    setNewUnitData((prev) => ({ ...prev, imei: e.target.value }))
                  }
                  placeholder="e.g., 359587012345678"
                  className={`w-full px-3 py-2 bg-slate-50 border ${formErrors.imei ? 'border-red-400' : 'border-slate-300'} text-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 placeholder-slate-400`}
                  autoFocus
                />
                {formErrors.imei && <p className="text-xs text-red-500 mt-1">{formErrors.imei}</p>}
              </div>

              {/* Device Config */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Device Config *
                </label>
                <select
                  value={newUnitData.device_name}
                  onChange={(e) =>
                    setNewUnitData((prev) => ({ ...prev, device_name: e.target.value }))
                  }
                  className={`w-full px-3 py-2 bg-slate-50 border ${formErrors.device_name ? 'border-red-400' : 'border-slate-300'} text-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500`}
                >
                  <option value="">Select a device config</option>
                  {deviceTypes.map((dt) => (
                    <option key={dt.device_name} value={dt.device_name}>
                      {dt.device_name}
                    </option>
                  ))}
                </select>
                {formErrors.device_name && <p className="text-xs text-red-500 mt-1">{formErrors.device_name}</p>}
              </div>

              {/* SIM Number */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  SIM Number *
                </label>
                <input
                  type="text"
                  value={newUnitData.sim_no || ""}
                  onChange={(e) =>
                    setNewUnitData((prev) => ({ ...prev, sim_no: e.target.value }))
                  }
                  placeholder="e.g., 98912345678"
                  className={`w-full px-3 py-2 bg-slate-50 border ${formErrors.sim_no ? 'border-red-400' : 'border-slate-300'} text-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 placeholder-slate-400`}
                />
                {formErrors.sim_no && <p className="text-xs text-red-500 mt-1">{formErrors.sim_no}</p>}
              </div>

              {/* Mega ID */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mega ID *
                </label>
                <input
                  type="text"
                  value={newUnitData.mega_id || ""}
                  onChange={(e) =>
                    setNewUnitData((prev) => ({ ...prev, mega_id: e.target.value }))
                  }
                  placeholder="e.g., M12345"
                  className={`w-full px-3 py-2 bg-slate-50 border ${formErrors.mega_id ? 'border-red-400' : 'border-slate-300'} text-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 placeholder-slate-400`}
                />
                {formErrors.mega_id && <p className="text-xs text-red-500 mt-1">{formErrors.mega_id}</p>}
              </div>

              {/* FFID - Optional */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  FFID <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newUnitData.ffid || ""}
                  onChange={(e) =>
                    setNewUnitData((prev) => ({ ...prev, ffid: e.target.value }))
                  }
                  placeholder="e.g., FF123"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 text-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 placeholder-slate-400"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end pt-3 border-t border-slate-200">
                <button
                  onClick={() => { setShowNewUnitModal(false); setFormErrors({}); }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition-all font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateUnit}
                  className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-all font-medium shadow-sm text-sm"
                >
                  Create Unit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
