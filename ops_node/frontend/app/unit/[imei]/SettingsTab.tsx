"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Settings, FolderTree, Send, ChevronRight, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Unit, UnitConfig } from "@/lib/api";
import { cn } from "@/lib/utils";
import SettingCard from "@/components/SettingCard";

/**
 * SettingsTab handles 5 navigation cases:
 * Case 1: No profile, no categoryTypeDesc (or "General") - Left: Categories, Right: Commands directly
 * Case 2: No profile, categoryTypeDesc exists - Left: CategoryTypeDescs, Right: Category dropdown + Commands
 * Case 3: Profile exists, no categoryTypeDesc (or "General") - Left: Profiles, Right: Category selection + Commands
 * Case 4: Profile + categoryTypeDesc exist - Left: Profiles, Right: CategoryTypeDesc + Category dropdown + Commands
 * Case 5: No profile, no categoryTypeDesc, no category - Direct commands (appears as "Direct" in sidebar)
 */

interface SettingsTabProps {
  unit: Unit;
  configs: UnitConfig[];
  onSendCommand: (configId: number, value?: string, sendMethod?: "sms" | "gprs") => Promise<boolean>;
}

// Sidebar item for left panel
interface SidebarItem {
  type: 'profile' | 'categoryType' | 'category' | 'direct';
  key: string;
  label: string;
  count: number;
}

export default function SettingsTab({ unit, configs, onSendCommand }: SettingsTabProps) {
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [selectedCategoryType, setSelectedCategoryType] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [settingsSearch, setSettingsSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  // Track changed values: Map<configId, value>
  const [changedValues, setChangedValues] = useState<Map<number, string>>(new Map());
  const [sendingAll, setSendingAll] = useState(false);
  const [sendAllMethod, setSendAllMethod] = useState<"sms" | "gprs">("sms");
  
  // Send ALL settings state (not just changes)
  const [sendingAllSettings, setSendingAllSettings] = useState(false);
  const [sendAllSettingsProgress, setSendAllSettingsProgress] = useState({ sent: 0, total: 0 });
  const [sendAllSettingsMethod, setSendAllSettingsMethod] = useState<"sms" | "gprs">("sms");

  // Handle value change from SettingCard
  const handleValueChange = useCallback((configId: number, value: string, hasChanged: boolean) => {
    setChangedValues(prev => {
      const next = new Map(prev);
      if (hasChanged) {
        next.set(configId, value);
      } else {
        next.delete(configId);
      }
      return next;
    });
  }, []);

  // Send all changed values
  const handleSendAllChanges = useCallback(async () => {
    if (changedValues.size === 0) return;
    
    setSendingAll(true);
    const entries = Array.from(changedValues.entries());
    
    // Send all in parallel with selected method
    const results = await Promise.all(
      entries.map(([configId, value]) => onSendCommand(configId, value, sendAllMethod))
    );
    
    // Remove successfully sent values from tracking
    const successfulIds = entries
      .filter((_, i) => results[i])
      .map(([id]) => id);
    
    setChangedValues(prev => {
      const next = new Map(prev);
      successfulIds.forEach(id => next.delete(id));
      return next;
    });
    
    setSendingAll(false);
  }, [changedValues, onSendCommand, sendAllMethod]);

  // Send ALL settings for the device (not just changes)
  const handleSendAllSettings = useCallback(async () => {
    if (configs.length === 0) return;
    
    setSendingAllSettings(true);
    setSendAllSettingsProgress({ sent: 0, total: configs.length });
    
    let sent = 0;
    for (const config of configs) {
      try {
        await onSendCommand(config.id, undefined, sendAllSettingsMethod);
        sent++;
        setSendAllSettingsProgress({ sent, total: configs.length });
      } catch (error) {
        console.error(`Failed to send setting ${config.id}:`, error);
      }
    }
    
    setSendingAllSettings(false);
    alert(`Sent ${sent} of ${configs.length} settings via ${sendAllSettingsMethod.toUpperCase()}`);
  }, [configs, onSendCommand, sendAllSettingsMethod]);

  // Build hierarchy data
  const hierarchy = useMemo(() => {
    const profiles = new Map<string, Map<string, Map<string, UnitConfig[]>>>(); // profile -> typeDesc -> category -> configs
    const categoryTypes = new Map<string, Map<string, UnitConfig[]>>(); // typeDesc -> category -> configs
    const directConfigs: UnitConfig[] = [];

    configs.forEach((cfg) => {
      const profile = cfg.profile || null;
      const typeDesc = cfg.category_type_desc || null;
      const category = cfg.category || null;

      // Case 5: Direct (no profile, no typeDesc, no category)
      if (!profile && !typeDesc && !category) {
        directConfigs.push(cfg);
        return;
      }

      // Has profile (Case 3 & 4)
      if (profile) {
        if (!profiles.has(profile)) profiles.set(profile, new Map());
        const profileMap = profiles.get(profile)!;
        const typeKey = typeDesc || '__GENERAL__';
        if (!profileMap.has(typeKey)) profileMap.set(typeKey, new Map());
        const catMap = profileMap.get(typeKey)!;
        const catKey = category || '__DIRECT__';
        if (!catMap.has(catKey)) catMap.set(catKey, []);
        catMap.get(catKey)!.push(cfg);
        return;
      }

      // No profile (Case 1 & 2)
      const typeKey = typeDesc || '__GENERAL__';
      if (!categoryTypes.has(typeKey)) categoryTypes.set(typeKey, new Map());
      const catMap = categoryTypes.get(typeKey)!;
      const catKey = category || '__DIRECT__';
      if (!catMap.has(catKey)) catMap.set(catKey, []);
      catMap.get(catKey)!.push(cfg);
    });

    return { profiles, categoryTypes, directConfigs };
  }, [configs]);

  // Determine sidebar items based on data
  // ALL cases should appear together in the left panel
  const sidebarItems = useMemo((): SidebarItem[] => {
    const items: SidebarItem[] = [];

    // Case 5: Direct settings (no profile, no categoryType, no category)
    // These appear as "Settings" at the top
    let directCount = hierarchy.directConfigs.length;
    
    // Also check for __DIRECT__ under __GENERAL__ category type
    const generalTypeMap = hierarchy.categoryTypes.get('__GENERAL__') || hierarchy.categoryTypes.get('General');
    if (generalTypeMap) {
      const generalDirect = generalTypeMap.get('__DIRECT__');
      if (generalDirect) directCount += generalDirect.length;
    }
    
    if (directCount > 0) {
      items.push({ type: 'direct', key: 'direct-settings', label: 'Settings', count: directCount });
    }

    // Case 1: Categories from General (no profile, no categoryTypeDesc or General)
    // Show each category as a sidebar item
    if (generalTypeMap) {
      generalTypeMap.forEach((cfgs, catKey) => {
        if (catKey !== '__DIRECT__') {
          items.push({ type: 'category', key: `category-${catKey}`, label: catKey, count: cfgs.length });
        }
      });
    }

    // Case 2: CategoryTypes that are not General (no profile, has categoryTypeDesc)
    // Show each categoryType as a sidebar item
    hierarchy.categoryTypes.forEach((catMap, typeKey) => {
      if (typeKey !== '__GENERAL__' && typeKey !== 'General') {
        let count = 0;
        catMap.forEach((cfgs) => (count += cfgs.length));
        items.push({ type: 'categoryType', key: `catType-${typeKey}`, label: typeKey, count });
      }
    });

    // Case 3 & 4: Profiles (has profile)
    const sortedProfiles = Array.from(hierarchy.profiles.entries()).sort(([a], [b]) => {
      const aNum = parseInt(a), bNum = parseInt(b);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.localeCompare(b);
    });
    
    // OPTIMIZATION: If there's only ONE profile and no other items, expand profile's content into sidebar
    // This avoids showing just "Profile 1" when it's the only option
    const hasOnlyOneProfile = sortedProfiles.length === 1 && items.length === 0;
    
    if (hasOnlyOneProfile) {
      const [singleProfile, singleProfileTypeMap] = sortedProfiles[0];
      
      // Get CategoryTypeDescs from this profile
      const profileCatTypes = Array.from(singleProfileTypeMap.entries());
      const nonGeneralTypes = profileCatTypes.filter(([k]) => k !== '__GENERAL__' && k !== 'General');
      const generalType = profileCatTypes.find(([k]) => k === '__GENERAL__' || k === 'General');
      
      // If profile has non-General CategoryTypeDescs, show them in sidebar
      if (nonGeneralTypes.length > 0) {
        nonGeneralTypes.forEach(([typeKey, catMap]) => {
          let count = 0;
          catMap.forEach((cfgs) => (count += cfgs.length));
          items.push({ type: 'categoryType', key: `profile-${singleProfile}-catType-${typeKey}`, label: typeKey, count });
        });
        // Also add General if it exists
        if (generalType) {
          const [typeKey, catMap] = generalType;
          let count = 0;
          catMap.forEach((cfgs) => (count += cfgs.length));
          items.push({ type: 'categoryType', key: `profile-${singleProfile}-catType-General`, label: 'General', count });
        }
      } else if (generalType) {
        // Profile only has General CategoryType - show its categories
        const [, catMap] = generalType;
        catMap.forEach((cfgs, catKey) => {
          if (catKey !== '__DIRECT__') {
            items.push({ type: 'category', key: `profile-${singleProfile}-category-${catKey}`, label: catKey, count: cfgs.length });
          }
        });
      }
    } else {
      // Multiple profiles or other items exist - show profiles normally
      sortedProfiles.forEach(([profile, typeMap]) => {
        let count = 0;
        typeMap.forEach((catMap) => catMap.forEach((cfgs) => (count += cfgs.length)));
        items.push({ type: 'profile', key: `profile-${profile}`, label: `Profile ${profile}`, count });
      });
    }

    return items;
  }, [hierarchy]);
  
  // Track if we're in single-profile expanded mode
  const singleProfileExpanded = useMemo(() => {
    const sortedProfiles = Array.from(hierarchy.profiles.entries());
    const hasNonProfileItems = hierarchy.directConfigs.length > 0 || hierarchy.categoryTypes.size > 0;
    return sortedProfiles.length === 1 && !hasNonProfileItems;
  }, [hierarchy]);
  
  // Get the single profile name for expanded mode
  const singleProfileName = useMemo(() => {
    if (!singleProfileExpanded) return null;
    const profiles = Array.from(hierarchy.profiles.keys());
    return profiles[0] || null;
  }, [singleProfileExpanded, hierarchy]);

  // Filter sidebar by search
  const filteredSidebarItems = useMemo(() => {
    if (!sidebarSearch) return sidebarItems;
    const q = sidebarSearch.toLowerCase();
    return sidebarItems.filter((i) => i.label.toLowerCase().includes(q));
  }, [sidebarItems, sidebarSearch]);

  // Auto-select first item
  useEffect(() => {
    if (sidebarItems.length > 0 && !selectedProfile && !selectedCategoryType && !selectedCategory) {
      const first = sidebarItems[0];
      handleSidebarClick(first);
    }
  }, [sidebarItems]);

  // Handle sidebar click
  const handleSidebarClick = (item: SidebarItem) => {
    if (item.type === 'profile') {
      const profile = item.key.replace('profile-', '');
      setSelectedProfile(profile);
      setSelectedCategoryType(null);
      setSelectedCategory(null);
    } else if (item.type === 'categoryType') {
      // Check if this is from single-profile expanded mode (key contains profile info)
      if (singleProfileExpanded && singleProfileName && item.key.startsWith(`profile-${singleProfileName}-`)) {
        setSelectedProfile(singleProfileName);
        setSelectedCategoryType(item.label);
        setSelectedCategory(null);
      } else {
        setSelectedProfile(null);
        setSelectedCategoryType(item.label);
        setSelectedCategory(null);
      }
    } else if (item.type === 'category') {
      // Check if this is from single-profile expanded mode
      if (singleProfileExpanded && singleProfileName && item.key.startsWith(`profile-${singleProfileName}-`)) {
        setSelectedProfile(singleProfileName);
        setSelectedCategoryType('__GENERAL__');
        setSelectedCategory(item.label);
      } else {
        setSelectedProfile(null);
        setSelectedCategoryType('__GENERAL__');
        setSelectedCategory(item.label);
      }
    } else if (item.type === 'direct') {
      setSelectedProfile(null);
      setSelectedCategoryType(null);
      setSelectedCategory('__DIRECT__');
    }
  };

  const isSelected = (item: SidebarItem): boolean => {
    if (item.type === 'profile') return selectedProfile === item.key.replace('profile-', '');
    if (item.type === 'categoryType') return !selectedProfile && selectedCategoryType === item.label;
    if (item.type === 'category') return !selectedProfile && selectedCategory === item.label;
    if (item.type === 'direct') return selectedCategory === '__DIRECT__';
    return false;
  };

  // Get categoryTypes for selected profile (Case 4)
  // Now includes "General" if other types also exist
  const profileCategoryTypes = useMemo((): { name: string; count: number }[] => {
    if (!selectedProfile || !hierarchy.profiles.has(selectedProfile)) return [];
    const typeMap = hierarchy.profiles.get(selectedProfile)!;
    const types: { name: string; count: number }[] = [];
    const generalTypes: { name: string; count: number }[] = [];
    
    typeMap.forEach((catMap, typeKey) => {
      let count = 0;
      catMap.forEach((cfgs) => (count += cfgs.length));
      
      if (typeKey === '__GENERAL__' || typeKey === 'General') {
        // Collect General types separately to add at the end
        generalTypes.push({ name: 'General', count });
      } else {
        types.push({ name: typeKey, count });
      }
    });
    
    // If there are non-General types, include General in the dropdown too
    // Sort non-General types and add General at the end
    types.sort((a, b) => a.name.localeCompare(b.name));
    return [...types, ...generalTypes];
  }, [selectedProfile, hierarchy]);

  // Get categories for dropdown/selection
  const availableCategories = useMemo((): { name: string; count: number }[] => {
    // Profile selected
    if (selectedProfile && hierarchy.profiles.has(selectedProfile)) {
      const typeMap = hierarchy.profiles.get(selectedProfile)!;

      // If profile has categoryTypes to select from (including General now)
      if (profileCategoryTypes.length > 0) {
        if (!selectedCategoryType) return [];
        
        // Handle "General" selection - look for __GENERAL__ or General key
        let catMap = typeMap.get(selectedCategoryType);
        if (!catMap && selectedCategoryType === 'General') {
          catMap = typeMap.get('__GENERAL__');
        }
        if (!catMap) return [];
        
        const cats: { name: string; count: number }[] = [];
        catMap.forEach((cfgs, catKey) => {
          cats.push({ name: catKey === '__DIRECT__' ? 'Direct' : catKey, count: cfgs.length });
        });
        return cats.sort((a, b) => (a.name === 'Direct' ? 1 : b.name === 'Direct' ? -1 : a.name.localeCompare(b.name)));
      }

      // Profile with only one categoryType - show categories directly (shouldn't happen now)
      const generalMap = typeMap.get('__GENERAL__') || typeMap.get('General');
      if (generalMap) {
        const cats: { name: string; count: number }[] = [];
        generalMap.forEach((cfgs, catKey) => {
          cats.push({ name: catKey === '__DIRECT__' ? 'Direct' : catKey, count: cfgs.length });
        });
        return cats.sort((a, b) => (a.name === 'Direct' ? 1 : b.name === 'Direct' ? -1 : a.name.localeCompare(b.name)));
      }
    }

    // CategoryType selected (Case 2) - non-profile categoryTypes
    if (selectedCategoryType && selectedCategoryType !== '__GENERAL__') {
      let catMap = hierarchy.categoryTypes.get(selectedCategoryType);
      if (!catMap && selectedCategoryType === 'General') {
        catMap = hierarchy.categoryTypes.get('__GENERAL__');
      }
      if (!catMap) return [];
      const cats: { name: string; count: number }[] = [];
      catMap.forEach((cfgs, catKey) => {
        cats.push({ name: catKey === '__DIRECT__' ? 'Direct' : catKey, count: cfgs.length });
      });
      return cats.sort((a, b) => (a.name === 'Direct' ? 1 : b.name === 'Direct' ? -1 : a.name.localeCompare(b.name)));
    }

    return [];
  }, [selectedProfile, selectedCategoryType, hierarchy, profileCategoryTypes]);

  // Get current configs to display
  const currentConfigs = useMemo((): UnitConfig[] => {
    // Direct settings (Case 5)
    if (selectedCategory === '__DIRECT__') {
      const configs: UnitConfig[] = [...hierarchy.directConfigs];
      const generalMap = hierarchy.categoryTypes.get('__GENERAL__') || hierarchy.categoryTypes.get('General');
      if (generalMap) {
        const directCfgs = generalMap.get('__DIRECT__');
        if (directCfgs) configs.push(...directCfgs);
      }
      return configs.sort((a, b) => (a.id ?? 0) - (b.id ?? 0) || a.command_name.localeCompare(b.command_name));
    }

    // Profile selected (Case 3 & 4)
    if (selectedProfile && hierarchy.profiles.has(selectedProfile)) {
      const typeMap = hierarchy.profiles.get(selectedProfile)!;

      // Case 4: Profile + categoryType + category
      if (profileCategoryTypes.length > 0 && selectedCategoryType && selectedCategory) {
        // Handle "General" - look for __GENERAL__ key too
        let catMap = typeMap.get(selectedCategoryType);
        if (!catMap && selectedCategoryType === 'General') {
          catMap = typeMap.get('__GENERAL__');
        }
        const catKey = selectedCategory === 'Direct' ? '__DIRECT__' : selectedCategory;
        return catMap?.get(catKey)?.sort((a, b) => (a.id ?? 0) - (b.id ?? 0) || a.command_name.localeCompare(b.command_name)) || [];
      }

      // Case 3: Profile + category (no categoryTypes - shouldn't happen now)
      if (profileCategoryTypes.length === 0 && selectedCategory) {
        const generalMap = typeMap.get('__GENERAL__') || typeMap.get('General');
        const catKey = selectedCategory === 'Direct' ? '__DIRECT__' : selectedCategory;
        return generalMap?.get(catKey)?.sort((a, b) => (a.id ?? 0) - (b.id ?? 0) || a.command_name.localeCompare(b.command_name)) || [];
      }

      // Auto-select first category if only one
      if (profileCategoryTypes.length === 0 && availableCategories.length === 1) {
        const generalMap = typeMap.get('__GENERAL__') || typeMap.get('General');
        const catKey = availableCategories[0].name === 'Direct' ? '__DIRECT__' : availableCategories[0].name;
        return generalMap?.get(catKey)?.sort((a, b) => (a.id ?? 0) - (b.id ?? 0) || a.command_name.localeCompare(b.command_name)) || [];
      }

      return [];
    }

    // CategoryType selected (Case 2) - non-profile
    if (selectedCategoryType && selectedCategoryType !== '__GENERAL__' && selectedCategory) {
      let catMap = hierarchy.categoryTypes.get(selectedCategoryType);
      if (!catMap && selectedCategoryType === 'General') {
        catMap = hierarchy.categoryTypes.get('__GENERAL__');
      }
      const catKey = selectedCategory === 'Direct' ? '__DIRECT__' : selectedCategory;
      return catMap?.get(catKey)?.sort((a, b) => (a.id ?? 0) - (b.id ?? 0) || a.command_name.localeCompare(b.command_name)) || [];
    }

    // Category from General (Case 1)
    if (selectedCategoryType === '__GENERAL__' && selectedCategory) {
      const generalMap = hierarchy.categoryTypes.get('__GENERAL__') || hierarchy.categoryTypes.get('General');
      return generalMap?.get(selectedCategory)?.sort((a, b) => (a.id ?? 0) - (b.id ?? 0) || a.command_name.localeCompare(b.command_name)) || [];
    }

    return [];
  }, [selectedProfile, selectedCategoryType, selectedCategory, hierarchy, profileCategoryTypes, availableCategories]);

  // Count changes in current view
  const changesInCurrentView = useMemo(() => {
    const currentIds = new Set(currentConfigs.map(c => c.id));
    return Array.from(changedValues.keys()).filter(id => currentIds.has(id)).length;
  }, [changedValues, currentConfigs]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4" style={{ minHeight: "400px" }}>
      {/* Left Sidebar */}
      <div className="w-full lg:w-56 flex-shrink-0 bg-white rounded-xl border border-slate-200 p-3 flex flex-col shadow-sm lg:max-h-[calc(100vh-280px)]">
        <div className="flex items-center gap-2 mb-3">
          <FolderTree className="w-4 h-4 text-primary-500" />
          <h3 className="font-semibold text-slate-800 text-sm">Navigate</h3>
        </div>

        <input
          type="text"
          placeholder="Search..."
          value={sidebarSearch}
          onChange={(e) => setSidebarSearch(e.target.value)}
          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs mb-3 focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 placeholder-slate-400"
        />

        <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
          {filteredSidebarItems.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs">No items found</div>
          ) : (
            filteredSidebarItems.map((item) => (
              <button
                key={item.key}
                onClick={() => handleSidebarClick(item)}
                className={cn(
                  "w-full text-left px-2.5 py-2 rounded-lg transition-all text-xs",
                  isSelected(item)
                    ? "bg-primary-500 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate font-medium">{item.label}</span>
                  <span className={cn("text-[10px] ml-1", isSelected(item) ? "text-white/70" : "text-slate-400")}>
                    {item.count}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col shadow-sm lg:max-h-[calc(100vh-280px)]">
        {/* Settings Search - at top, searches ALL settings */}
        <div className="p-3 border-b border-slate-200 bg-slate-50">
          <input
            type="text"
            placeholder="Search all settings..."
            value={settingsSearch}
            onChange={(e) => setSettingsSearch(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-slate-400"
          />
          {settingsSearch.trim() && (
            <p className="text-xs text-slate-500 mt-1">
              Showing results from all settings
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Breadcrumb - only show when not searching */}
          {!settingsSearch.trim() && (selectedProfile || selectedCategoryType || selectedCategory) && selectedCategory !== '__DIRECT__' && (
            <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {selectedProfile && <span className="text-slate-700 font-medium">Profile {selectedProfile}</span>}
                {selectedCategoryType && selectedCategoryType !== '__GENERAL__' && (
                  <>
                    {selectedProfile && <ChevronRight className="w-3 h-3 text-slate-400" />}
                    <span className="text-slate-700">{selectedCategoryType}</span>
                  </>
                )}
                {selectedCategory && selectedCategory !== '__DIRECT__' && (
                  <>
                    {(selectedProfile || (selectedCategoryType && selectedCategoryType !== '__GENERAL__')) && (
                      <ChevronRight className="w-3 h-3 text-slate-400" />
                    )}
                    <span className="text-slate-700">{selectedCategory}</span>
                  </>
                )}
              </div>
            </div>
          )}
          
          {/* Case 4: CategoryType dropdown for profiles with non-General types */}
          {!settingsSearch.trim() && selectedProfile && profileCategoryTypes.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">Category Type</label>
                <select
                  value={selectedCategoryType || ""}
                onChange={(e) => {
                  setSelectedCategoryType(e.target.value || null);
                  setSelectedCategory(null);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Select type...</option>
                {profileCategoryTypes.map((ct) => (
                  <option key={ct.name} value={ct.name}>
                    {ct.name} ({ct.count})
                  </option>
                  ))}
                </select>
              </div>
          )}

          {/* Case 3: Category buttons for profiles with only General type (when multiple categories) */}
          {!settingsSearch.trim() && selectedProfile && profileCategoryTypes.length === 0 && availableCategories.length > 1 && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600">Select Category</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableCategories.map((cat) => (
                      <button
                    key={cat.name}
                    onClick={() => setSelectedCategory(cat.name === 'Direct' ? '__DIRECT__' : cat.name)}
                        className={cn(
                      "px-3 py-2 rounded-lg text-xs font-medium transition-all border",
                      selectedCategory === (cat.name === 'Direct' ? '__DIRECT__' : cat.name)
                        ? "bg-primary-500 text-white border-primary-400"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    )}
                  >
                    {cat.name}
                    <span className="ml-1 opacity-70">({cat.count})</span>
                      </button>
                ))}
              </div>
            </div>
          )}

          {/* Case 2 & 4: Category dropdown when categoryType selected and has multiple categories */}
          {!settingsSearch.trim() && ((selectedProfile && profileCategoryTypes.length > 0 && selectedCategoryType) ||
            (!selectedProfile && selectedCategoryType && selectedCategoryType !== '__GENERAL__')) &&
            availableCategories.length > 1 && (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-600">Category</label>
                <select
                  value={selectedCategory || ""}
                  onChange={(e) => setSelectedCategory(e.target.value || null)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Select category...</option>
                  {availableCategories.map((cat) => (
                    <option key={cat.name} value={cat.name === 'Direct' ? '__DIRECT__' : cat.name}>
                      {cat.name} ({cat.count})
                    </option>
                  ))}
                </select>
              </div>
            )}

          {/* Auto-select single category message */}
          {!settingsSearch.trim() && ((selectedProfile && profileCategoryTypes.length > 0 && selectedCategoryType && availableCategories.length === 1) ||
            (!selectedProfile && selectedCategoryType && selectedCategoryType !== '__GENERAL__' && availableCategories.length === 1)) &&
            !selectedCategory && (
              <div className="text-xs text-slate-500">
                Showing: {availableCategories[0].name} ({availableCategories[0].count} settings)
              </div>
            )}
          
          {/* Settings Display */}
          {(() => {
            // When searching, show all matching settings from ALL configs
            // When not searching, show based on hierarchy selection (currentConfigs)
            const settingsToDisplay = settingsSearch.trim()
              ? configs.filter((setting) => {
                  const search = settingsSearch.toLowerCase();
                  return (
                    setting.command_name?.toLowerCase().includes(search) ||
                    setting.description?.toLowerCase().includes(search) ||
                    setting.category?.toLowerCase().includes(search) ||
                    setting.category_type_desc?.toLowerCase().includes(search)
                  );
                })
              : currentConfigs;
            
            return settingsToDisplay.length > 0 ? (
              <div className="space-y-2">
                {settingsToDisplay.map((setting) => (
                  <SettingCard
                    key={setting.id}
                    setting={setting}
                    onSendCommand={onSendCommand}
                    onValueChange={handleValueChange}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <Settings className="w-8 h-8 mb-3 opacity-50" />
                <p className="text-xs">
                  {settingsSearch.trim()
                    ? "No settings match your search"
                    : selectedProfile || selectedCategoryType || selectedCategory
                    ? availableCategories.length > 0
                      ? "Select a category to view settings"
                      : profileCategoryTypes.length > 0
                      ? "Select a category type to continue"
                      : "No settings found"
                  : "Select an item from the sidebar"}
                </p>
              </div>
            );
          })()}
        </div>

        {/* Compact Footer - Send Actions */}
        <div className="p-2 sm:p-3 border-t border-slate-200 bg-slate-50">
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Send Changes Group */}
            <div className="flex items-center gap-1.5 flex-1">
              <button
                onClick={handleSendAllChanges}
                disabled={sendingAll || changesInCurrentView === 0}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded-lg font-medium flex items-center justify-center gap-1.5 transition-all text-xs",
                  changesInCurrentView > 0
                    ? "bg-primary-500 hover:bg-primary-600 text-white"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                )}
              >
                {sendingAll ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">Changes</span> ({changesInCurrentView})
              </button>
              <div className="flex bg-slate-200 rounded-md p-0.5">
                <button
                  onClick={() => setSendAllMethod("sms")}
                  disabled={sendingAll}
                  className={cn(
                    "px-2 py-1 text-[10px] font-medium rounded transition-all",
                    sendAllMethod === "sms" ? "bg-white text-slate-700 shadow-sm" : "text-slate-500"
                  )}
                >
                  SMS
                </button>
                <button
                  onClick={() => setSendAllMethod("gprs")}
                  disabled={sendingAll}
                  className={cn(
                    "px-2 py-1 text-[10px] font-medium rounded transition-all",
                    sendAllMethod === "gprs" ? "bg-white text-slate-700 shadow-sm" : "text-slate-500"
                  )}
                >
                  GPRS
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px bg-slate-300" />

            {/* Send All Settings Group */}
            <div className="flex items-center gap-1.5 flex-1">
              <button
                onClick={handleSendAllSettings}
                disabled={sendingAllSettings || configs.length === 0}
                className="flex-1 px-3 py-1.5 rounded-lg font-medium flex items-center justify-center gap-1.5 transition-all text-xs bg-accent-500 hover:bg-accent-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendingAllSettings ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {sendAllSettingsProgress.sent}/{sendAllSettingsProgress.total}
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">All</span> ({configs.length})
                  </>
                )}
              </button>
              <div className="flex bg-slate-200 rounded-md p-0.5">
                <button
                  onClick={() => setSendAllSettingsMethod("sms")}
                  disabled={sendingAllSettings}
                  className={cn(
                    "px-2 py-1 text-[10px] font-medium rounded transition-all",
                    sendAllSettingsMethod === "sms" ? "bg-white text-slate-700 shadow-sm" : "text-slate-500"
                  )}
                >
                  SMS
                </button>
                <button
                  onClick={() => setSendAllSettingsMethod("gprs")}
                  disabled={sendingAllSettings}
                  className={cn(
                    "px-2 py-1 text-[10px] font-medium rounded transition-all",
                    sendAllSettingsMethod === "gprs" ? "bg-white text-slate-700 shadow-sm" : "text-slate-500"
                  )}
                >
                  GPRS
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
