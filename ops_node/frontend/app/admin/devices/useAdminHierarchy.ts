'use client';

import { useMemo } from 'react';
import { DeviceConfig } from '@/lib/api';

/**
 * Admin-focused hierarchy for device config editing
 * 
 * Structure:
 * - ConfigType (Setting | Command) at top level via tabs
 * - Tree structure: Profile → CategoryTypeDesc → Category → Configs
 * - Non-profile configs: CategoryTypeDesc → Category → Configs
 * - Direct configs (no profile, no typeDesc, no category)
 */

export interface TreeNode {
  id: string;
  type: 'profile' | 'categoryType' | 'category' | 'direct';
  label: string;
  count: number;
  children?: TreeNode[];
  // For leaf nodes or when selecting a node
  configs?: DeviceConfig[];
}

export interface AdminHierarchy {
  // Tree nodes for sidebar navigation
  tree: TreeNode[];
  // Flat lookup for quick access
  configsByPath: Map<string, DeviceConfig[]>;
  // Total counts
  totalSettings: number;
  totalCommands: number;
}

/**
 * Build admin hierarchy from configs
 * @param configs - All configs for the selected device
 * @param configTypeFilter - 'Setting' | 'Command' | 'all'
 */
export function useAdminHierarchy(
  configs: DeviceConfig[],
  configTypeFilter: 'Setting' | 'Command' | 'all' = 'all'
): AdminHierarchy {
  return useMemo(() => {
    // Filter by config type if specified
    const filteredConfigs = configTypeFilter === 'all' 
      ? configs 
      : configs.filter(c => c.config_type === configTypeFilter);

    // Count totals
    const totalSettings = configs.filter(c => c.config_type === 'Setting').length;
    const totalCommands = configs.filter(c => c.config_type === 'Command').length;

    // Build hierarchical structure
    // Map: profile -> categoryTypeDesc -> category -> configs[]
    const profileMap = new Map<string, Map<string, Map<string, DeviceConfig[]>>>();
    // Map: categoryTypeDesc -> category -> configs[] (for non-profile configs)
    const nonProfileMap = new Map<string, Map<string, DeviceConfig[]>>();
    // Direct configs (no profile, no typeDesc, no category)
    const directConfigs: DeviceConfig[] = [];
    // Flat lookup
    const configsByPath = new Map<string, DeviceConfig[]>();

    filteredConfigs.forEach((cfg) => {
      const profile = cfg.profile || null;
      const typeDesc = cfg.category_type_desc || null;
      const category = cfg.category || null;

      // Direct configs: no profile, no typeDesc, no category
      if (!profile && !typeDesc && !category) {
        directConfigs.push(cfg);
        return;
      }

      // Has profile
      if (profile) {
        if (!profileMap.has(profile)) {
          profileMap.set(profile, new Map());
        }
        const typeMap = profileMap.get(profile)!;
        const typeKey = typeDesc || 'General';
        
        if (!typeMap.has(typeKey)) {
          typeMap.set(typeKey, new Map());
        }
        const catMap = typeMap.get(typeKey)!;
        const catKey = category || 'Direct';
        
        if (!catMap.has(catKey)) {
          catMap.set(catKey, []);
        }
        catMap.get(catKey)!.push(cfg);
        return;
      }

      // No profile - goes to nonProfileMap
      const typeKey = typeDesc || 'General';
      if (!nonProfileMap.has(typeKey)) {
        nonProfileMap.set(typeKey, new Map());
      }
      const catMap = nonProfileMap.get(typeKey)!;
      const catKey = category || 'Direct';
      
      if (!catMap.has(catKey)) {
        catMap.set(catKey, []);
      }
      catMap.get(catKey)!.push(cfg);
    });

    // Build tree structure
    const tree: TreeNode[] = [];

    // Add direct configs first (if any)
    if (directConfigs.length > 0) {
      const directNode: TreeNode = {
        id: 'direct',
        type: 'direct',
        label: 'Direct Settings',
        count: directConfigs.length,
        configs: sortConfigs(directConfigs),
      };
      tree.push(directNode);
      configsByPath.set('direct', directConfigs);
    }

    // Add non-profile category types
    const sortedNonProfileTypes = Array.from(nonProfileMap.entries())
      .sort(([a], [b]) => sortTypeDesc(a, b));

    sortedNonProfileTypes.forEach(([typeDesc, catMap]) => {
      const typeNode: TreeNode = {
        id: `type-${typeDesc}`,
        type: 'categoryType',
        label: typeDesc,
        count: 0,
        children: [],
      };

      const sortedCategories = Array.from(catMap.entries())
        .sort(([a], [b]) => sortCategory(a, b));

      sortedCategories.forEach(([category, cfgs]) => {
        const catNode: TreeNode = {
          id: `type-${typeDesc}-cat-${category}`,
          type: 'category',
          label: category,
          count: cfgs.length,
          configs: sortConfigs(cfgs),
        };
        typeNode.children!.push(catNode);
        typeNode.count += cfgs.length;
        configsByPath.set(catNode.id, cfgs);
      });

      // If only one category under this type, flatten it
      if (typeNode.children!.length === 1) {
        const singleCat = typeNode.children![0];
        typeNode.configs = singleCat.configs;
        typeNode.children = undefined;
        configsByPath.set(typeNode.id, singleCat.configs || []);
      }

      tree.push(typeNode);
    });

    // Add profiles
    const sortedProfiles = Array.from(profileMap.entries())
      .sort(([a], [b]) => sortProfile(a, b));

    sortedProfiles.forEach(([profile, typeMap]) => {
      const profileNode: TreeNode = {
        id: `profile-${profile}`,
        type: 'profile',
        label: `Profile ${profile}`,
        count: 0,
        children: [],
      };

      const sortedTypes = Array.from(typeMap.entries())
        .sort(([a], [b]) => sortTypeDesc(a, b));

      sortedTypes.forEach(([typeDesc, catMap]) => {
        const typeNode: TreeNode = {
          id: `profile-${profile}-type-${typeDesc}`,
          type: 'categoryType',
          label: typeDesc,
          count: 0,
          children: [],
        };

        const sortedCategories = Array.from(catMap.entries())
          .sort(([a], [b]) => sortCategory(a, b));

        sortedCategories.forEach(([category, cfgs]) => {
          const catNode: TreeNode = {
            id: `profile-${profile}-type-${typeDesc}-cat-${category}`,
            type: 'category',
            label: category,
            count: cfgs.length,
            configs: sortConfigs(cfgs),
          };
          typeNode.children!.push(catNode);
          typeNode.count += cfgs.length;
          configsByPath.set(catNode.id, cfgs);
        });

        // If only one category under this type, flatten it
        if (typeNode.children!.length === 1) {
          const singleCat = typeNode.children![0];
          typeNode.configs = singleCat.configs;
          typeNode.children = undefined;
          configsByPath.set(typeNode.id, singleCat.configs || []);
        }

        profileNode.children!.push(typeNode);
        profileNode.count += typeNode.count;
      });

      // If profile has only one type with configs, flatten
      if (profileNode.children!.length === 1 && profileNode.children![0].configs) {
        const singleType = profileNode.children![0];
        profileNode.label = `Profile ${profile} › ${singleType.label}`;
        profileNode.configs = singleType.configs;
        profileNode.children = undefined;
        configsByPath.set(profileNode.id, singleType.configs || []);
      }

      tree.push(profileNode);
    });

    return {
      tree,
      configsByPath,
      totalSettings,
      totalCommands,
    };
  }, [configs, configTypeFilter]);
}

// Helper: Sort configs by id then name
function sortConfigs(configs: DeviceConfig[]): DeviceConfig[] {
  return [...configs].sort((a, b) => 
    (a.id || 0) - (b.id || 0) || a.command_name.localeCompare(b.command_name)
  );
}

// Helper: Sort type descriptions (General first, then alphabetical)
function sortTypeDesc(a: string, b: string): number {
  if (a === 'General') return -1;
  if (b === 'General') return 1;
  return a.localeCompare(b);
}

// Helper: Sort categories (Direct last, then alphabetical)
function sortCategory(a: string, b: string): number {
  if (a === 'Direct') return 1;
  if (b === 'Direct') return -1;
  return a.localeCompare(b);
}

// Helper: Sort profiles numerically
function sortProfile(a: string, b: string): number {
  const aNum = parseInt(a);
  const bNum = parseInt(b);
  if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
  return a.localeCompare(b);
}

/**
 * Get configs for a selected tree node
 */
export function getConfigsForNode(
  hierarchy: AdminHierarchy,
  nodeId: string | null
): DeviceConfig[] {
  if (!nodeId) return [];
  return hierarchy.configsByPath.get(nodeId) || [];
}

/**
 * Find all configs under a node (including children)
 */
export function getAllConfigsUnderNode(
  node: TreeNode
): DeviceConfig[] {
  if (node.configs) {
    return node.configs;
  }
  
  if (node.children) {
    const allConfigs: DeviceConfig[] = [];
    node.children.forEach(child => {
      allConfigs.push(...getAllConfigsUnderNode(child));
    });
    return sortConfigs(allConfigs);
  }
  
  return [];
}
