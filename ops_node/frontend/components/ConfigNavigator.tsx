'use client';

import { useState, useMemo, useEffect } from 'react';
import { FolderTree, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Unified Config Navigator Component
 * 
 * Handles 5 navigation cases:
 * Case 1: No profile, no categoryTypeDesc (or "General") - Left: Categories, Right: Commands directly
 * Case 2: No profile, categoryTypeDesc exists - Left: CategoryTypeDescs, Right: Category dropdown + Commands
 * Case 3: Profile exists, no categoryTypeDesc (or "General") - Left: Profiles, Right: Category selection + Commands
 * Case 4: Profile + categoryTypeDesc exist - Left: Profiles, Right: CategoryTypeDesc + Category dropdown + Commands
 * Case 5: No profile, no categoryTypeDesc, no category - Direct commands (no hierarchy)
 */

// Generic config type that works for both UnitConfig and DeviceConfig
export interface BaseConfig {
  id?: number;
  command_name: string;
  category_type_desc?: string | null;
  category?: string | null;
  profile?: string | null;
  [key: string]: any;
}

export interface CategoryData<T extends BaseConfig> {
  name: string | null;
  categoryTypeDesc: string | null;
  configs: T[];
}

export interface CategoryTypeData<T extends BaseConfig> {
  name: string;
  categories: CategoryData<T>[];
}

export interface ProfileData<T extends BaseConfig> {
  profile: string;
  categoryTypes: CategoryTypeData<T>[];
}

export interface HierarchyData<T extends BaseConfig> {
  profiles: ProfileData<T>[];
  categoryTypes: CategoryTypeData<T>[];
  directCommands: T[];
}

// Sidebar item types for left panel
interface SidebarItem {
  type: 'profile' | 'categoryType' | 'category' | 'direct';
  key: string;
  label: string;
  count: number;
  data?: any;
}

interface ConfigNavigatorProps<T extends BaseConfig> {
  configs: T[];
  renderConfig: (config: T, index: number) => React.ReactNode;
  onSelectionChange?: (selection: {
    profile: string | null;
    categoryType: string | null;
    category: string | null;
  }) => void;
  title?: string;
  emptyMessage?: string;
}

export function buildHierarchy<T extends BaseConfig>(configs: T[]): HierarchyData<T> {
  const profiles: Map<string, Map<string, Map<string, T[]>>> = new Map(); // profile -> categoryTypeDesc -> category -> configs
  const categoryTypes: Map<string, Map<string, T[]>> = new Map(); // categoryTypeDesc -> category -> configs
  const directCommands: T[] = [];

  configs.forEach((config) => {
    const profile = config.profile;
    const categoryTypeDesc = config.category_type_desc || null;
    const category = config.category || null;

    // Case 5: Direct commands (no profile, no categoryTypeDesc, no category)
    if (!profile && !categoryTypeDesc && !category) {
      directCommands.push(config);
      return;
    }

    // Case 3 & 4: Has profile
    if (profile) {
      if (!profiles.has(profile)) profiles.set(profile, new Map());
      const profileMap = profiles.get(profile)!;
      const typeKey = categoryTypeDesc || '__GENERAL__';
      if (!profileMap.has(typeKey)) profileMap.set(typeKey, new Map());
      const catMap = profileMap.get(typeKey)!;
      const catKey = category || '__DIRECT__';
      if (!catMap.has(catKey)) catMap.set(catKey, []);
      catMap.get(catKey)!.push(config);
      return;
    }

    // Case 1 & 2: No profile
    const typeKey = categoryTypeDesc || '__GENERAL__';
    if (!categoryTypes.has(typeKey)) categoryTypes.set(typeKey, new Map());
    const catMap = categoryTypes.get(typeKey)!;
    const catKey = category || '__DIRECT__';
    if (!catMap.has(catKey)) catMap.set(catKey, []);
    catMap.get(catKey)!.push(config);
  });

  // Convert Maps to structured data
  const typeOrder: Record<string, number> = { '__GENERAL__': 1, 'General': 1, 'IOProperties': 2, 'Profile': 3 };

  const sortTypes = (a: string, b: string) => {
    const aOrder = typeOrder[a] ?? 999;
    const bOrder = typeOrder[b] ?? 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.localeCompare(b);
  };

  const sortCategories = (a: string, b: string) => {
    if (a === '__DIRECT__') return 1;
    if (b === '__DIRECT__') return -1;
    return a.localeCompare(b);
  };

  const buildCategoryTypeData = (catTypeMap: Map<string, Map<string, T[]>>): CategoryTypeData<T>[] => {
    return Array.from(catTypeMap.entries())
      .sort(([a], [b]) => sortTypes(a, b))
      .map(([typeKey, catMap]) => ({
        name: typeKey === '__GENERAL__' ? 'General' : typeKey,
        categories: Array.from(catMap.entries())
          .sort(([a], [b]) => sortCategories(a, b))
          .map(([catKey, cfgs]) => ({
            name: catKey === '__DIRECT__' ? null : catKey,
            categoryTypeDesc: typeKey === '__GENERAL__' ? null : typeKey,
            configs: cfgs.sort((a, b) => (a.id ?? 0) - (b.id ?? 0) || a.command_name.localeCompare(b.command_name)),
          })),
      }));
  };

  return {
    profiles: Array.from(profiles.entries())
      .sort(([a], [b]) => {
        const aNum = parseInt(a), bNum = parseInt(b);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.localeCompare(b);
      })
      .map(([profile, catTypeMap]) => ({
        profile,
        categoryTypes: buildCategoryTypeData(catTypeMap),
      })),
    categoryTypes: buildCategoryTypeData(categoryTypes),
    directCommands: directCommands.sort((a, b) => (a.id ?? 0) - (b.id ?? 0) || a.command_name.localeCompare(b.command_name)),
  };
}

export function ConfigNavigator<T extends BaseConfig>({
  configs,
  renderConfig,
  onSelectionChange,
  title = 'Navigate',
  emptyMessage = 'No items found',
}: ConfigNavigatorProps<T>) {
  const hierarchy = useMemo(() => buildHierarchy(configs), [configs]);

  // Selection state
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [selectedCategoryType, setSelectedCategoryType] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Determine what shows in left sidebar
  // ALL cases should appear together in the left panel
  const sidebarItems = useMemo((): SidebarItem[] => {
    const items: SidebarItem[] = [];
    
    const generalType = hierarchy.categoryTypes.find((ct) => ct.name === 'General');

    // Case 5: Direct commands (no profile, no categoryType, no category)
    // These appear as "Commands" at the top
    let directCount = hierarchy.directCommands.length;
    // Also check for null category under General
    if (generalType) {
      const generalDirect = generalType.categories.find((c) => c.name === null);
      if (generalDirect) directCount += generalDirect.configs.length;
    }
    
    if (directCount > 0) {
      items.push({
        type: 'direct',
        key: 'direct-commands',
        label: 'Commands',
        count: directCount,
        data: hierarchy.directCommands,
      });
    }

    // Case 1: Categories from General (no profile, no categoryTypeDesc or General)
    // Show each category as a sidebar item
    if (generalType && generalType.categories.length > 0) {
      generalType.categories.forEach((cat) => {
        if (cat.name) { // Skip null (direct) - already handled above
          items.push({
            type: 'category',
            key: `category-${cat.name}`,
            label: cat.name,
            count: cat.configs.length,
            data: cat,
          });
        }
      });
    }

    // Case 2: CategoryTypes that are not General (no profile, has categoryTypeDesc)
    // Show each categoryType as a sidebar item
    const nonGeneralTypes = hierarchy.categoryTypes.filter((ct) => ct.name !== 'General');
    nonGeneralTypes.forEach((ct) => {
      const configCount = ct.categories.reduce((s, c) => s + c.configs.length, 0);
      items.push({
        type: 'categoryType',
        key: `catType-${ct.name}`,
        label: ct.name,
        count: configCount,
        data: ct,
      });
    });

    // Case 3 & 4: Profiles (has profile)
    // Show each profile as a sidebar item
    hierarchy.profiles.forEach((p) => {
      const configCount = p.categoryTypes.reduce((sum, ct) => sum + ct.categories.reduce((s, c) => s + c.configs.length, 0), 0);
      items.push({
        type: 'profile',
        key: `profile-${p.profile}`,
        label: `Profile ${p.profile}`,
        count: configCount,
        data: p,
      });
    });

    return items;
  }, [hierarchy]);

  // Filter sidebar items by search
  const filteredSidebarItems = useMemo(() => {
    if (!sidebarSearch) return sidebarItems;
    const query = sidebarSearch.toLowerCase();
    return sidebarItems.filter((item) => item.label.toLowerCase().includes(query));
  }, [sidebarItems, sidebarSearch]);

  // Auto-select first item
  useEffect(() => {
    if (sidebarItems.length > 0 && !selectedProfile && !selectedCategoryType && !selectedCategory) {
      const first = sidebarItems[0];
      if (first.type === 'profile') {
        setSelectedProfile((first.data as ProfileData<T>).profile);
      } else if (first.type === 'categoryType') {
        setSelectedCategoryType((first.data as CategoryTypeData<T>).name);
      } else if (first.type === 'category') {
        setSelectedCategoryType('General');
        setSelectedCategory((first.data as CategoryData<T>).name);
      } else if (first.type === 'direct') {
        setSelectedCategory('__DIRECT__');
      }
    }
  }, [sidebarItems, selectedProfile, selectedCategoryType, selectedCategory]);

  // Notify parent of selection changes
  useEffect(() => {
    onSelectionChange?.({
      profile: selectedProfile,
      categoryType: selectedCategoryType,
      category: selectedCategory,
    });
  }, [selectedProfile, selectedCategoryType, selectedCategory, onSelectionChange]);

  // Get current configs to display
  const currentConfigs = useMemo((): T[] => {
    // Direct commands
    if (selectedCategory === '__DIRECT__' || (sidebarItems.length === 1 && sidebarItems[0].type === 'direct')) {
      return hierarchy.directCommands;
    }

    // Profile selected
    if (selectedProfile) {
      const profileData = hierarchy.profiles.find((p) => p.profile === selectedProfile);
      if (!profileData) return [];

      if (selectedCategoryType && selectedCategory) {
        const catType = profileData.categoryTypes.find((ct) => ct.name === selectedCategoryType);
        const cat = catType?.categories.find((c) => c.name === selectedCategory || (c.name === null && selectedCategory === '__DIRECT__'));
        return cat?.configs || [];
      }
      
      if (selectedCategoryType) {
        const catType = profileData.categoryTypes.find((ct) => ct.name === selectedCategoryType);
        if (catType?.categories.length === 1) {
          return catType.categories[0].configs;
        }
      }

      // Show first available configs if nothing else selected
      if (profileData.categoryTypes.length > 0) {
        const firstType = profileData.categoryTypes[0];
        if (firstType.categories.length > 0) {
          return firstType.categories[0].configs;
        }
      }
      return [];
    }

    // CategoryType selected (Case 2)
    if (selectedCategoryType && selectedCategoryType !== 'General') {
      const catType = hierarchy.categoryTypes.find((ct) => ct.name === selectedCategoryType);
      if (!catType) return [];

      if (selectedCategory) {
        const cat = catType.categories.find((c) => c.name === selectedCategory || (c.name === null && selectedCategory === '__DIRECT__'));
        return cat?.configs || [];
      }

      // If only one category, show it directly
      if (catType.categories.length === 1) {
        return catType.categories[0].configs;
      }
      return [];
    }

    // Category selected from General (Case 1)
    if (selectedCategoryType === 'General' && selectedCategory) {
      const generalType = hierarchy.categoryTypes.find((ct) => ct.name === 'General');
      const cat = generalType?.categories.find((c) => c.name === selectedCategory || (c.name === null && selectedCategory === '__DIRECT__'));
      return cat?.configs || [];
    }

    return [];
  }, [selectedProfile, selectedCategoryType, selectedCategory, hierarchy, sidebarItems]);

  // Get available categoryTypes for profile (Case 4)
  const profileCategoryTypes = useMemo((): CategoryTypeData<T>[] => {
    if (!selectedProfile) return [];
    const profileData = hierarchy.profiles.find((p) => p.profile === selectedProfile);
    return profileData?.categoryTypes.filter((ct) => ct.name !== 'General') || [];
  }, [selectedProfile, hierarchy]);

  // Get available categories for dropdown
  const availableCategories = useMemo((): CategoryData<T>[] => {
    if (selectedProfile) {
      const profileData = hierarchy.profiles.find((p) => p.profile === selectedProfile);
      if (!profileData) return [];

      // If profile has non-General categoryTypes, need to select one first
      const nonGeneral = profileData.categoryTypes.filter((ct) => ct.name !== 'General');
      if (nonGeneral.length > 0) {
        if (!selectedCategoryType || selectedCategoryType === 'General') return [];
        const catType = profileData.categoryTypes.find((ct) => ct.name === selectedCategoryType);
        return catType?.categories || [];
      }

      // Profile with only General categories (Case 3)
      const generalType = profileData.categoryTypes.find((ct) => ct.name === 'General');
      return generalType?.categories || [];
    }

    // No profile, categoryType selected (Case 2)
    if (selectedCategoryType && selectedCategoryType !== 'General') {
      const catType = hierarchy.categoryTypes.find((ct) => ct.name === selectedCategoryType);
      return catType?.categories || [];
    }

    return [];
  }, [selectedProfile, selectedCategoryType, hierarchy]);

  // Determine if we need to show category dropdown
  const showCategoryDropdown = availableCategories.length > 1;

  // Handle sidebar item click
  const handleSidebarClick = (item: SidebarItem) => {
    if (item.type === 'profile') {
      setSelectedProfile((item.data as ProfileData<T>).profile);
      setSelectedCategoryType(null);
      setSelectedCategory(null);
    } else if (item.type === 'categoryType') {
      setSelectedProfile(null);
      setSelectedCategoryType((item.data as CategoryTypeData<T>).name);
      setSelectedCategory(null);
    } else if (item.type === 'category') {
      setSelectedProfile(null);
      setSelectedCategoryType('General');
      setSelectedCategory((item.data as CategoryData<T>).name);
    } else if (item.type === 'direct') {
      setSelectedProfile(null);
      setSelectedCategoryType(null);
      setSelectedCategory('__DIRECT__');
    }
  };

  const toggleExpanded = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isSelected = (item: SidebarItem) => {
    if (item.type === 'profile') return selectedProfile === (item.data as ProfileData<T>).profile;
    if (item.type === 'categoryType') return !selectedProfile && selectedCategoryType === (item.data as CategoryTypeData<T>).name;
    if (item.type === 'category') return !selectedProfile && selectedCategoryType === 'General' && selectedCategory === (item.data as CategoryData<T>).name;
    if (item.type === 'direct') return selectedCategory === '__DIRECT__';
    return false;
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4" style={{ minHeight: '400px' }}>
      {/* Left Sidebar */}
      <div className="w-full lg:w-56 flex-shrink-0 bg-white rounded-xl border border-slate-200 p-3 flex flex-col shadow-sm lg:max-h-[calc(100vh-280px)]">
        <div className="flex items-center gap-2 mb-3">
          <FolderTree className="w-4 h-4 text-primary-500" />
          <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
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
            <div className="text-center py-6 text-slate-400 text-xs">{emptyMessage}</div>
          ) : (
            filteredSidebarItems.map((item) => (
              <button
                key={item.key}
                onClick={() => handleSidebarClick(item)}
                className={cn(
                  'w-full text-left px-2.5 py-2 rounded-lg transition-all text-xs',
                  isSelected(item)
                    ? 'bg-primary-500 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate font-medium">{item.label}</span>
                  <span
                    className={cn(
                      'text-[10px] ml-1',
                      isSelected(item) ? 'text-white/70' : 'text-slate-400'
                    )}
                  >
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
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Breadcrumb */}
          {(selectedProfile || selectedCategoryType || selectedCategory) && selectedCategory !== '__DIRECT__' && (
            <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {selectedProfile && (
                  <span className="text-slate-700 font-medium">Profile {selectedProfile}</span>
                )}
                {selectedCategoryType && selectedCategoryType !== 'General' && (
                  <>
                    {selectedProfile && <ChevronRight className="w-3 h-3 text-slate-400" />}
                    <span className="text-slate-700">{selectedCategoryType}</span>
                  </>
                )}
                {selectedCategory && selectedCategory !== '__DIRECT__' && (
                  <>
                    {(selectedProfile || (selectedCategoryType && selectedCategoryType !== 'General')) && (
                      <ChevronRight className="w-3 h-3 text-slate-400" />
                    )}
                    <span className="text-slate-700">{selectedCategory}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Case 4: CategoryType dropdown for profiles with non-General types */}
          {selectedProfile && profileCategoryTypes.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">Category Type</label>
              <select
                value={selectedCategoryType || ''}
                onChange={(e) => {
                  setSelectedCategoryType(e.target.value || null);
                  setSelectedCategory(null);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Select type...</option>
                {profileCategoryTypes.map((ct) => (
                  <option key={ct.name} value={ct.name}>
                    {ct.name} ({ct.categories.reduce((s, c) => s + c.configs.length, 0)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Case 3: Category buttons for profiles with only General type */}
          {selectedProfile && profileCategoryTypes.length === 0 && availableCategories.length > 1 && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600">Select Category</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableCategories.map((cat) => (
                  <button
                    key={cat.name || '__DIRECT__'}
                    onClick={() => {
                      setSelectedCategoryType('General');
                      setSelectedCategory(cat.name || '__DIRECT__');
                    }}
                    className={cn(
                      'px-3 py-2 rounded-lg text-xs font-medium transition-all border',
                      selectedCategory === (cat.name || '__DIRECT__')
                        ? 'bg-primary-500 text-white border-primary-400'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    )}
                  >
                    {cat.name || 'Direct'}
                    <span className="ml-1 opacity-70">({cat.configs.length})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Case 2 & 4: Category dropdown when categoryType selected and has multiple categories */}
          {showCategoryDropdown && (selectedCategoryType && selectedCategoryType !== 'General') && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">Category</label>
              <select
                value={selectedCategory || ''}
                onChange={(e) => setSelectedCategory(e.target.value || null)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Select category...</option>
                {availableCategories.map((cat) => (
                  <option key={cat.name || '__DIRECT__'} value={cat.name || '__DIRECT__'}>
                    {cat.name || 'Direct'} ({cat.configs.length})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Configs Display */}
          {currentConfigs.length > 0 ? (
            <div className="space-y-2">
              {currentConfigs.map((config, index) => renderConfig(config, index))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <FolderTree className="w-8 h-8 mb-3 opacity-50" />
              <p className="text-xs">
                {selectedProfile || selectedCategoryType || selectedCategory
                  ? 'Select a category to view items'
                  : 'Select an item from the sidebar'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ConfigNavigator;
