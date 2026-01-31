import { UnitConfig } from "@/lib/api";

export type TabType = "settings" | "commands" | "history" | "unit-io-mapping";

// Full hierarchy: CategoryTypeDesc -> Category -> Profile -> CommandName
export interface ProfileGroup {
  profile: string | null;
  settings: UnitConfig[];
}

export interface CategoryGroup {
  name: string | null;  // null when category doesn't exist - settings shown directly under CategoryTypeDesc
  categoryTypeDesc: string | null;
  profiles: ProfileGroup[];  // Only for settings WITH profiles
  directSettings?: UnitConfig[];  // Settings without profiles (shown directly under category)
}

export interface CategoryTypeGroup {
  name: string;
  categories: CategoryGroup[];
}

export interface ProfileGroupType {
  profile: string;
  categoryTypes: CategoryTypeGroup[];
}

export interface DeviceGroup {
  deviceName: string;
  profiles?: ProfileGroupType[]; // For configs with both category and profile: Profile -> CategoryTypeDesc -> Category
  categoryTypes?: CategoryTypeGroup[]; // For other cases: CategoryTypeDesc -> Category/Profile/Direct
}

export interface LeftSidebarItem {
  type: 'profile' | 'categoryType' | 'category';
  key: string;
  label: string;
  data?: any;
}

export type LeftSidebarItems = 
  | { type: 'empty'; items: [] }
  | { type: 'mixed'; items: LeftSidebarItem[] }
  | { type: 'profiles'; items: string[] }
  | { type: 'categoryTypes'; items: CategoryTypeGroup[] }
  | { type: 'categories'; items: CategoryGroup[] };
