import { useMemo } from "react";
import { UnitConfig } from "@/lib/api";
import { DeviceGroup, CategoryGroup, CategoryTypeGroup, ProfileGroupType, LeftSidebarItems, LeftSidebarItem } from "./types";

// Build hierarchy from configs
export function useBuildHierarchy(configs: UnitConfig[]): DeviceGroup[] {
  return useMemo(() => {
    type SettingsWithBoth = Record<string, Record<string, Record<string, UnitConfig[]>>>;
    type GroupedSettings = {
      withCategory: Record<string, UnitConfig[]>;
      withoutCategory: Record<string, UnitConfig[]>;
      direct: UnitConfig[];
    };

    const deviceGroups: Record<string, {
      withBoth: SettingsWithBoth;
      others: Record<string, GroupedSettings>;
    }> = {};

    configs.forEach((config) => {
      const deviceName = config.device_name || "__NULL__";
      const typeDesc = config.category_type_desc || "__NULL__";
      const category = config.category;
      const profile = config.profile;
      
      if (!deviceGroups[deviceName]) {
        deviceGroups[deviceName] = { withBoth: {}, others: {} };
      }
      
      if (category && profile) {
        if (!deviceGroups[deviceName].withBoth[profile]) {
          deviceGroups[deviceName].withBoth[profile] = {};
        }
        if (!deviceGroups[deviceName].withBoth[profile][typeDesc]) {
          deviceGroups[deviceName].withBoth[profile][typeDesc] = {};
        }
        if (!deviceGroups[deviceName].withBoth[profile][typeDesc][category]) {
          deviceGroups[deviceName].withBoth[profile][typeDesc][category] = [];
        }
        deviceGroups[deviceName].withBoth[profile][typeDesc][category].push(config);
      } else {
        if (!deviceGroups[deviceName].others[typeDesc]) {
          deviceGroups[deviceName].others[typeDesc] = { withCategory: {}, withoutCategory: {}, direct: [] };
        }
        const typeGroup = deviceGroups[deviceName].others[typeDesc];
        
        if (category && !profile) {
          if (!typeGroup.withCategory[category]) typeGroup.withCategory[category] = [];
          typeGroup.withCategory[category].push(config);
        } else if (!category && profile) {
          if (!typeGroup.withoutCategory[profile]) typeGroup.withoutCategory[profile] = [];
          typeGroup.withoutCategory[profile].push(config);
        } else {
          typeGroup.direct.push(config);
        }
      }
    });

    const typeOrder: Record<string, number> = { "General": 1, "IOProperties": 2, "Profile": 3, "__NULL__": 999 };
    const hierarchy: DeviceGroup[] = [];

    Object.keys(deviceGroups).forEach((deviceName) => {
      const group = deviceGroups[deviceName];
      const result: DeviceGroup = { deviceName: deviceName === "__NULL__" ? "Unknown Device" : deviceName };
      
      // Process settings with both category and profile
      const profileGroups: ProfileGroupType[] = [];
      const sortedProfiles = Object.keys(group.withBoth).sort((a, b) => {
        const aNum = parseInt(a), bNum = parseInt(b);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.localeCompare(b);
      });
      
      sortedProfiles.forEach((profile) => {
        const profileData = group.withBoth[profile];
        const categoryTypes: CategoryTypeGroup[] = [];
        
        const sortedTypeDescs = Object.keys(profileData).sort((a, b) => {
          const aOrder = typeOrder[a] || 999, bOrder = typeOrder[b] || 999;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.localeCompare(b);
        });
        
        sortedTypeDescs.forEach((typeDesc) => {
          const categories: CategoryGroup[] = [];
          const categoryEntries = Object.entries(profileData[typeDesc]).sort(([a], [b]) => a.localeCompare(b));
          
          categoryEntries.forEach(([category, settings]) => {
            categories.push({
              name: category,
              categoryTypeDesc: typeDesc === "__NULL__" ? null : typeDesc,
              profiles: [{
                profile,
                settings: settings.sort((a, b) => {
                  if (a.id && b.id) return (a.id || 0) - (b.id || 0);
                  return a.command_name.localeCompare(b.command_name);
                }),
              }],
            });
          });
          
          if (categories.length > 0) {
            categoryTypes.push({ name: typeDesc === "__NULL__" ? "General" : typeDesc, categories });
          }
        });
        
        if (categoryTypes.length > 0) {
          profileGroups.push({ profile, categoryTypes });
        }
      });
      
      if (profileGroups.length > 0) result.profiles = profileGroups;
      
      // Process other settings
      const categoryTypes: CategoryTypeGroup[] = [];
      const sortedTypeDescs = Object.keys(group.others).sort((a, b) => {
        const aOrder = typeOrder[a] || 999, bOrder = typeOrder[b] || 999;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.localeCompare(b);
      });
      
      sortedTypeDescs.forEach((typeDesc) => {
        const typeGroup = group.others[typeDesc];
        const categories: CategoryGroup[] = [];
        
        // Category only (no profile)
        Object.entries(typeGroup.withCategory).sort(([a], [b]) => a.localeCompare(b)).forEach(([category, settings]) => {
          categories.push({
            name: category,
            categoryTypeDesc: typeDesc === "__NULL__" ? null : typeDesc,
            profiles: [],
            directSettings: settings.sort((a, b) => {
              if (a.id && b.id) return (a.id || 0) - (b.id || 0);
              return a.command_name.localeCompare(b.command_name);
            }),
          });
        });
        
        // Profile only (no category)
        const profileEntries = Object.entries(typeGroup.withoutCategory).sort(([a], [b]) => {
          const aNum = parseInt(a), bNum = parseInt(b);
          if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
          return a.localeCompare(b);
        });
        profileEntries.forEach(([profile, settings]) => {
          categories.push({
            name: null,
            categoryTypeDesc: typeDesc === "__NULL__" ? null : typeDesc,
            profiles: [{
              profile: profile || null,
              settings: settings.sort((a, b) => {
                if (a.id && b.id) return (a.id || 0) - (b.id || 0);
                return a.command_name.localeCompare(b.command_name);
              }),
            }],
          });
        });
        
        // Direct (neither)
        if (typeGroup.direct.length > 0) {
          categories.push({
            name: null,
            categoryTypeDesc: typeDesc === "__NULL__" ? null : typeDesc,
            profiles: [],
            directSettings: typeGroup.direct.sort((a, b) => {
              if (a.id && b.id) return (a.id || 0) - (b.id || 0);
              return a.command_name.localeCompare(b.command_name);
            }),
          });
        }
        
        if (categories.length > 0) {
          categoryTypes.push({ name: typeDesc === "__NULL__" ? "General" : typeDesc, categories });
        }
      });
      
      if (categoryTypes.length > 0) result.categoryTypes = categoryTypes;
      hierarchy.push(result);
    });

    return hierarchy;
  }, [configs]);
}

// Get left sidebar items from hierarchy
export function useLeftSidebarItems(hierarchy: DeviceGroup[]): LeftSidebarItems {
  return useMemo(() => {
    if (hierarchy.length === 0) return { type: 'empty' as const, items: [] };
    const deviceGroup = hierarchy[0];
    
    const items: LeftSidebarItem[] = [];
    
    // Add profiles (Case 3 & 4)
    if (deviceGroup.profiles && deviceGroup.profiles.length > 0) {
      deviceGroup.profiles.forEach(profile => {
        items.push({
          type: 'profile',
          key: `profile-${profile.profile}`,
          label: `Profile: ${profile.profile}`,
          data: profile.profile
        });
      });
    }
    
    // Add CategoryTypeDescs and Categories
    if (deviceGroup.categoryTypes && deviceGroup.categoryTypes.length > 0) {
      const nonGeneralTypes = deviceGroup.categoryTypes.filter(t => t.name && t.name !== "General" && t.name !== "__NULL__");
      
      // Case 2: CategoryTypeDescs
      nonGeneralTypes.forEach(typeGroup => {
        items.push({
          type: 'categoryType',
          key: `categoryType-${typeGroup.name}`,
          label: typeGroup.name || "General",
          data: typeGroup
        });
      });
      
      // Case 1: Categories from General
      const generalType = deviceGroup.categoryTypes.find(t => t.name === "General");
      if (generalType) {
        generalType.categories.forEach(category => {
          if (category.name !== null) {
            items.push({
              type: 'category',
              key: `category-${category.name || 'direct'}`,
              label: category.name || "(Direct)",
              data: category
            });
          }
        });
      }
      
      // Case 5: Direct commands
      deviceGroup.categoryTypes?.forEach(typeGroup => {
        const directCategory = typeGroup.categories.find(c => 
          c.name === null && c.directSettings && c.directSettings.length > 0 && c.categoryTypeDesc === null
        );
        if (directCategory && !items.some(i => i.key === 'direct-commands')) {
          items.push({
            type: 'category',
            key: 'direct-commands',
            label: 'Direct Commands',
            data: { ...directCategory, isDirectCommand: true }
          });
        }
      });
    }
    
    if (items.length === 0) return { type: 'empty' as const, items: [] };
    
    if (items.some(i => i.type === 'profile') && items.some(i => i.type !== 'profile')) {
      return { type: 'mixed' as const, items };
    } else if (items.every(i => i.type === 'profile')) {
      return { type: 'profiles' as const, items: items.map(i => i.data) };
    } else if (items.every(i => i.type === 'categoryType')) {
      return { type: 'categoryTypes' as const, items: items.map(i => i.data) };
    } else {
      return { type: 'categories' as const, items: items.map(i => i.data) };
    }
  }, [hierarchy]);
}

// Get selected category data
export function useSelectedCategoryData(
  hierarchy: DeviceGroup[],
  selectedProfile: string | null,
  selectedCategoryType: string | null,
  selectedCategory: string | null
): CategoryGroup | null {
  return useMemo(() => {
    if (hierarchy.length === 0) return null;
    const deviceGroup = hierarchy[0];
    
    // Case 5: Direct Commands
    if (selectedCategory === "direct-commands" || (selectedCategory === null && !selectedCategoryType && !selectedProfile)) {
      for (const typeGroup of deviceGroup.categoryTypes || []) {
        const directCategory = typeGroup.categories.find(c => 
          c.name === null && c.directSettings && c.directSettings.length > 0
        );
        if (directCategory) return directCategory;
      }
    }
    
    // Case 1: Category selected directly
    if (!selectedProfile && selectedCategory !== null && selectedCategory !== undefined && selectedCategory !== "direct-commands") {
      const generalType = deviceGroup.categoryTypes?.find(t => t.name === "General" || !t.name);
      if (generalType) {
        const found = generalType.categories.find(c => selectedCategory === null ? c.name === null : c.name === selectedCategory);
        if (found) return found;
      }
    }
    
    if (!selectedCategoryType) return null;
    
    // Try profiles first
    if (selectedProfile && deviceGroup.profiles) {
      const profileGroup = deviceGroup.profiles.find(p => p.profile === selectedProfile);
      if (profileGroup) {
        const typeGroup = profileGroup.categoryTypes.find(t => t.name === selectedCategoryType);
        if (typeGroup) {
          const found = typeGroup.categories.find(c => selectedCategory === null ? c.name === null : c.name === selectedCategory);
          if (found) return found;
        }
      }
    }
    
    // Then try categoryTypes
    if (deviceGroup.categoryTypes) {
      const typeGroup = deviceGroup.categoryTypes.find(t => t.name === selectedCategoryType);
      if (typeGroup) {
        return typeGroup.categories.find(c => selectedCategory === null ? c.name === null : c.name === selectedCategory) || null;
      }
    }
    
    return null;
  }, [hierarchy, selectedProfile, selectedCategoryType, selectedCategory]);
}
