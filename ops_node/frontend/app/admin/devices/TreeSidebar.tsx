'use client';

import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, FolderTree, Settings, Layers, FolderOpen, Folder, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TreeNode, getAllConfigsUnderNode } from './useAdminHierarchy';

interface TreeSidebarProps {
  tree: TreeNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string, configs: import('@/lib/api').DeviceConfig[]) => void;
  searchQuery?: string;
}

export default function TreeSidebar({ 
  tree, 
  selectedNodeId, 
  onSelectNode,
  searchQuery = ''
}: TreeSidebarProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [sidebarSearch, setSidebarSearch] = useState('');

  // Combine external search with sidebar search
  const effectiveSearch = searchQuery || sidebarSearch;

  // Filter tree based on search
  const filteredTree = useMemo(() => {
    if (!effectiveSearch.trim()) return tree;
    
    const query = effectiveSearch.toLowerCase();
    
    // Deep filter - keep nodes that match or have matching descendants
    const filterNode = (node: TreeNode): TreeNode | null => {
      const labelMatches = node.label.toLowerCase().includes(query);
      
      // Check if any configs match
      const configsMatch = node.configs?.some(cfg => 
        cfg.command_name?.toLowerCase().includes(query) ||
        cfg.description?.toLowerCase().includes(query)
      );
      
      // Filter children recursively
      const filteredChildren = node.children
        ?.map(child => filterNode(child))
        .filter((child): child is TreeNode => child !== null);
      
      // Keep node if it matches, has matching configs, or has matching children
      if (labelMatches || configsMatch || (filteredChildren && filteredChildren.length > 0)) {
        return {
          ...node,
          children: filteredChildren && filteredChildren.length > 0 ? filteredChildren : node.children,
        };
      }
      
      return null;
    };
    
    return tree
      .map(node => filterNode(node))
      .filter((node): node is TreeNode => node !== null);
  }, [tree, effectiveSearch]);

  // Auto-expand all when searching
  const displayExpandedNodes = useMemo(() => {
    if (effectiveSearch.trim()) {
      // When searching, expand all nodes
      const allNodeIds = new Set<string>();
      const collectIds = (nodes: TreeNode[]) => {
        nodes.forEach(node => {
          if (node.children) {
            allNodeIds.add(node.id);
            collectIds(node.children);
          }
        });
      };
      collectIds(filteredTree);
      return allNodeIds;
    }
    return expandedNodes;
  }, [effectiveSearch, filteredTree, expandedNodes]);

  const toggleNode = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleNodeClick = (node: TreeNode) => {
    const configs = getAllConfigsUnderNode(node);
    onSelectNode(node.id, configs);
  };

  const getNodeIcon = (node: TreeNode, isExpanded: boolean) => {
    switch (node.type) {
      case 'profile':
        return isExpanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />;
      case 'categoryType':
        return <Layers className="w-4 h-4" />;
      case 'category':
        return <FileText className="w-4 h-4" />;
      case 'direct':
        return <Settings className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = displayExpandedNodes.has(node.id);
    const isSelected = selectedNodeId === node.id;
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs group",
            isSelected
              ? "bg-primary-500 text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
          )}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => handleNodeClick(node)}
        >
          {/* Expand/Collapse toggle */}
          {hasChildren ? (
            <button
              onClick={(e) => toggleNode(node.id, e)}
              className={cn(
                "p-0.5 rounded hover:bg-black/10 transition-colors",
                isSelected ? "text-white/80" : "text-slate-400"
              )}
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>
          ) : (
            <span className="w-4" /> // Spacer for alignment
          )}

          {/* Icon */}
          <span className={cn(
            "flex-shrink-0",
            isSelected ? "text-white/80" : "text-slate-400 group-hover:text-slate-500"
          )}>
            {getNodeIcon(node, isExpanded)}
          </span>

          {/* Label */}
          <span className="flex-1 truncate font-medium">{node.label}</span>

          {/* Count badge */}
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full",
            isSelected 
              ? "bg-white/20 text-white" 
              : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
          )}>
            {node.count}
          </span>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="ml-0">
            {node.children!.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full lg:w-64 flex-shrink-0 bg-white rounded-xl border border-slate-200 p-3 flex flex-col shadow-sm lg:max-h-[calc(100vh-320px)]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <FolderTree className="w-4 h-4 text-primary-500" />
        <h3 className="font-semibold text-slate-800 text-sm">Structure</h3>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search..."
        value={sidebarSearch}
        onChange={(e) => setSidebarSearch(e.target.value)}
        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs mb-3 focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 placeholder-slate-400"
      />

      {/* Tree */}
      <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
        {filteredTree.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs">
            {effectiveSearch.trim() ? 'No matching items' : 'No configurations'}
          </div>
        ) : (
          filteredTree.map(node => renderNode(node))
        )}
      </div>

      {/* Expand/Collapse All */}
      {tree.some(n => n.children) && !effectiveSearch.trim() && (
        <div className="pt-2 mt-2 border-t border-slate-200 flex gap-2">
          <button
            onClick={() => {
              const allIds = new Set<string>();
              const collectIds = (nodes: TreeNode[]) => {
                nodes.forEach(node => {
                  if (node.children) {
                    allIds.add(node.id);
                    collectIds(node.children);
                  }
                });
              };
              collectIds(tree);
              setExpandedNodes(allIds);
            }}
            className="flex-1 text-[10px] text-slate-500 hover:text-slate-700 py-1"
          >
            Expand All
          </button>
          <button
            onClick={() => setExpandedNodes(new Set())}
            className="flex-1 text-[10px] text-slate-500 hover:text-slate-700 py-1"
          >
            Collapse All
          </button>
        </div>
      )}
    </div>
  );
}
