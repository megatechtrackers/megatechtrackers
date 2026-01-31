#!/usr/bin/env python3
"""
Grafana Dashboard Generator
===========================
Generates Grafana JSON dashboards from concise YAML definitions.

**Edit YAML only.** The JSON files in ../dashboards/ are generated; do not edit
them manually. After changing any .yaml in dashboards/, run:
  python generate.py              # all dashboards
  python generate.py <name>       # e.g. python generate.py system-health

Usage:
    python generate.py                    # Generate all dashboards
    python generate.py alarm-service-costs   # Generate specific dashboard
    python generate.py --validate         # Validate without generating

Features:
    - Auto-adds "or vector(0)" fallback to all queries
    - Auto-adds spanNulls: true to all timeseries
    - Auto-calculates gridPos from panel order
    - Variable substitution {var_name}
    - Threshold presets ($preset_name)
    - Unit shortcuts ($ -> currencyUSD)
    - Concise query syntax (metric | Legend)
"""

import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import yaml

# Paths
SCRIPT_DIR = Path(__file__).parent
DEFAULTS_FILE = SCRIPT_DIR / "_defaults.yaml"
DASHBOARDS_DIR = SCRIPT_DIR / "dashboards"  # YAML source files
OUTPUT_DIR = SCRIPT_DIR.parent / "dashboards"  # Grafana dashboards folder (JSON output)


class DashboardGenerator:
    def __init__(self):
        self.defaults = self._load_defaults()
        self.current_y = 0
        self.current_x = 0
        self.row_max_height = 0  # Track max height in current row
        self.panel_id = 1
        self.ref_id_counter = 0
    
    def _load_defaults(self) -> Dict:
        """Load defaults from _defaults.yaml"""
        with open(DEFAULTS_FILE, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    
    def _get_ref_id(self) -> str:
        """Generate next refId (A, B, C, ..., Z, AA, AB, ...)"""
        idx = self.ref_id_counter
        self.ref_id_counter += 1
        if idx < 26:
            return chr(65 + idx)
        else:
            return chr(65 + (idx // 26) - 1) + chr(65 + (idx % 26))
    
    def _reset_ref_ids(self):
        """Reset refId counter for new panel"""
        self.ref_id_counter = 0
    
    def _resolve_unit(self, unit: Optional[str]) -> Optional[str]:
        """Resolve unit shortcut to Grafana unit ID"""
        if not unit:
            return None
        units = self.defaults.get('units', {})
        return units.get(unit, unit)
    
    def _resolve_thresholds(self, thresholds: Any) -> Optional[Dict]:
        """Resolve threshold definition to Grafana format"""
        if not thresholds:
            return None
        
        # Preset reference: $preset_name
        if isinstance(thresholds, str) and thresholds.startswith('$'):
            preset_name = thresholds[1:]
            preset = self.defaults.get('thresholds', {}).get(preset_name)
            if preset:
                return {
                    "mode": "absolute",
                    "steps": [{"value": s.get('value'), "color": s.get('color')} for s in preset]
                }
        
        # Compact format: [10:yellow, 100:red]
        if isinstance(thresholds, list):
            steps = [{"value": None, "color": "green"}]  # Base step
            for item in thresholds:
                if isinstance(item, str) and ':' in item:
                    value, color = item.split(':', 1)
                    steps.append({"value": float(value), "color": color})
                elif isinstance(item, dict):
                    steps.append({"value": item.get('value'), "color": item.get('color')})
            return {"mode": "absolute", "steps": steps}
        
        return None
    
    def _resolve_mappings(self, mappings: Any) -> Optional[List]:
        """Resolve value mappings"""
        if not mappings:
            return None
        
        # Preset reference: $preset_name
        if isinstance(mappings, str) and mappings.startswith('$'):
            preset_name = mappings[1:]
            preset = self.defaults.get('mappings', {}).get(preset_name)
            if preset:
                mappings = preset
        
        if isinstance(mappings, list):
            result = []
            for m in mappings:
                result.append({
                    "type": "value",
                    "options": {
                        str(m.get('value', 0)): {
                            "text": m.get('text', ''),
                            "color": m.get('color', 'green')
                        }
                    }
                })
            return result
        
        return None
    
    def _process_query(self, query: str, variables: Dict, add_fallback: bool = True) -> str:
        """Process query: variable substitution, rate wrapping, fallback"""
        expr = query
        
        # Variable substitution: {var_name}
        for var_name, var_value in variables.items():
            expr = expr.replace(f'{{{var_name}}}', str(var_value))
        
        # Add fallback if not already present
        if add_fallback and 'or vector(' not in expr.lower():
            fallback = self.defaults.get('query', {}).get('fallback', 0)
            # Wrap complex expressions in parentheses
            if any(op in expr for op in ['+', '-', '*', '/']):
                expr = f"({expr}) or vector({fallback})"
            else:
                expr = f"{expr} or vector({fallback})"
        
        return expr
    
    def _parse_query_with_legend(self, query_str: str) -> tuple:
        """Parse 'metric | Legend' format"""
        if ' | ' in query_str:
            parts = query_str.split(' | ', 1)
            return parts[0].strip(), parts[1].strip()
        return query_str, None
    
    def _extract_metric_name(self, query: str) -> str:
        """Extract the primary metric name from a PromQL query for use as default legend"""
        import re
        clean = query.strip()
        
        # Try to find a metric name pattern
        patterns = [
            r'rate\((\w+)',           # rate(metric_name[...])
            r'sum\((\w+)',            # sum(metric_name...)
            r'avg\((\w+)',            # avg(metric_name...)
            r'count\((\w+)',          # count(metric_name...)
            r'max\((\w+)',            # max(metric_name...)
            r'min\((\w+)',            # min(metric_name...)
            r'increase\((\w+)',       # increase(metric_name[...])
            r'^(\w+)(?:\{|$|\s|\[)',  # metric_name{...} or metric_name[...] or just metric_name
        ]
        
        for pattern in patterns:
            match = re.search(pattern, clean)
            if match:
                return match.group(1)
        
        return ""
    
    def _get_smart_legend(self, query: str, metric_name: str) -> str:
        """Generate a smart legend format based on query and metric patterns"""
        query_lower = query.lower()
        
        # PostgreSQL metrics - use database name
        if metric_name.startswith('pg_') or 'pg_stat' in query_lower:
            return "{{datname}}"
        
        # Prometheus internal metrics
        if metric_name.startswith('prometheus_'):
            if 'rule' in metric_name:
                return "{{rule_group}}"
            if 'duration' in metric_name or 'quantile' in query_lower:
                return "p{{quantile}}"
            return metric_name.replace('prometheus_', '').replace('_total', '').replace('_seconds', '').replace('_', ' ').title()
        
        # Metrics with quantile (histograms/summaries)
        if 'quantile' in query_lower or '_bucket' in query_lower:
            return "p{{quantile}}"
        
        # Parser service metrics
        if 'parser_service_' in query_lower or metric_name.startswith('parser_service_'):
            return "{{node}}"
        
        # RabbitMQ queue metrics
        if 'rabbitmq' in query_lower:
            if 'queue' in query_lower:
                return "{{queue}}"
            return metric_name.replace('rabbitmq_', '').replace('_', ' ').title()
        
        # PgBouncer pool metrics
        if 'pgbouncer' in query_lower:
            return "{{database}}"
        
        # SMS modem metrics
        if 'sms_modem' in query_lower or metric_name.startswith('sms_modem_'):
            return "{{modem_name}}"
        
        # Alarm/notification channel metrics  
        if 'channel' in query_lower and ('email' in query_lower or 'sms' in query_lower or 'voice' in query_lower):
            return "{{channel}}"
        
        # Fleet metrics - clean up the name
        if metric_name.startswith('fleet_'):
            return metric_name.replace('fleet_', '').replace('_', ' ').title()
        
        # Generic metrics - make them readable
        if metric_name:
            # Clean up common suffixes and prefixes
            clean_name = metric_name
            for suffix in ['_total', '_count', '_seconds', '_bytes', '_percent']:
                clean_name = clean_name.replace(suffix, '')
            # Convert to title case with spaces
            return clean_name.replace('_', ' ').title()
        
        return "{{__name__}}"
    
    def _build_targets(self, panel_config: Dict, variables: Dict) -> List[Dict]:
        """Build targets array from queries"""
        self._reset_ref_ids()
        targets = []
        
        # Single query
        if 'query' in panel_config:
            query, legend = self._parse_query_with_legend(panel_config['query'])
            expr = self._process_query(query, variables)
            
            # Handle rate transform
            if panel_config.get('transform') == 'rate':
                rate_interval = self.defaults.get('query', {}).get('rate_interval', '$__rate_interval')
                # Remove existing or vector() for rate wrapping
                if ' or vector(' in expr:
                    expr = expr.rsplit(' or vector(', 1)[0]
                    if expr.startswith('(') and expr.endswith(')'):
                        expr = expr[1:-1]
                expr = f"rate({expr}[{rate_interval}])"
                if panel_config.get('rate_multiplier'):
                    expr = f"({expr}) * {panel_config['rate_multiplier']}"
                expr = f"({expr}) or vector(0)"
            
            target = {
                "expr": expr,
                "refId": self._get_ref_id()
            }
            # Stat, gauge, piechart, pie, bargauge all need instant queries
            instant_types = ['stat', 'gauge', 'piechart', 'pie', 'bargauge']
            panel_type = panel_config.get('type', 'stat')
            
            if legend:
                target["legendFormat"] = legend
            elif panel_type in instant_types:
                # Empty legend for single-value panels - textMode: "value" handles display
                target["legendFormat"] = ""
            elif panel_type == 'timeseries':
                # Use smart legend that picks appropriate label templates
                metric_name = self._extract_metric_name(query)
                target["legendFormat"] = self._get_smart_legend(query, metric_name)
            elif panel_type == 'table':
                # Tables work best with empty legend - columns show data
                target["legendFormat"] = ""
            
            # Set instant mode for stat-like panels AND tables
            if panel_config.get('instant', panel_type in instant_types or panel_type == 'table'):
                target["instant"] = True
            
            # Tables need format: "table" for proper rendering
            if panel_type == 'table':
                target["format"] = "table"
            
            targets.append(target)
        
        # Multiple queries
        if 'queries' in panel_config:
            panel_type = panel_config.get('type', 'stat')  # Get type once for all queries
            for q in panel_config['queries']:
                if isinstance(q, str):
                    query, legend = self._parse_query_with_legend(q)
                    expr = self._process_query(query, variables)
                else:
                    query = q.get('expr', q.get('query', ''))
                    legend = q.get('legend', q.get('legendFormat'))
                    expr = self._process_query(query, variables)
                    
                    if q.get('transform') == 'rate':
                        rate_interval = self.defaults.get('query', {}).get('rate_interval', '$__rate_interval')
                        # Remove existing or vector() for rate wrapping
                        if ' or vector(' in expr:
                            expr = expr.rsplit(' or vector(', 1)[0]
                            # Strip outer parentheses that were added for fallback
                            if expr.startswith('(') and expr.endswith(')'):
                                expr = expr[1:-1]
                        expr = f"rate({expr}[{rate_interval}])"
                        if q.get('rate_multiplier'):
                            expr = f"({expr}) * {q['rate_multiplier']}"
                        expr = f"({expr}) or vector(0)"
                
                target = {
                    "expr": expr,
                    "refId": self._get_ref_id()
                }
                # Stat, gauge, piechart, pie, bargauge all need instant queries
                instant_types = ['stat', 'gauge', 'piechart', 'pie', 'bargauge']
                
                if legend:
                    target["legendFormat"] = legend
                elif panel_type in instant_types:
                    # Empty legend for single-value panels - textMode: "value" handles display
                    target["legendFormat"] = ""
                elif panel_type == 'timeseries':
                    # Use smart legend that picks appropriate label templates
                    metric_name = self._extract_metric_name(query)
                    target["legendFormat"] = self._get_smart_legend(query, metric_name)
                elif panel_type == 'table':
                    # Tables work best with empty legend
                    target["legendFormat"] = ""
                
                # Set instant mode for stat-like panels AND tables
                if panel_config.get('instant', panel_type in instant_types or panel_type == 'table'):
                    target["instant"] = True
                
                # Tables need format: "table" for proper rendering
                if panel_type == 'table':
                    target["format"] = "table"
                
                if isinstance(q, dict) and q.get('color'):
                    pass  # Color handled in overrides
                
                targets.append(target)
        
        return targets
    
    def _get_panel_size(self, panel_config: Dict) -> tuple:
        """Get panel width and height"""
        panel_type = panel_config.get('type', 'stat')
        default_sizes = self.defaults.get('layout', {}).get('sizes', {})
        default_size = default_sizes.get(panel_type, [12, 8])
        
        width = panel_config.get('width', panel_config.get('w', default_size[0]))
        height = panel_config.get('height', panel_config.get('h', default_size[1]))
        
        # Handle pos: [x, y, w, h] format
        if 'pos' in panel_config:
            pos = panel_config['pos']
            if len(pos) >= 4:
                width = pos[2]
                height = pos[3]
        
        # Handle size: [w, h] format
        if 'size' in panel_config:
            size = panel_config['size']
            width = size[0]
            height = size[1]
        
        return width, height
    
    def _calculate_grid_pos(self, panel_config: Dict) -> Dict:
        """Calculate gridPos for panel"""
        width, height = self._get_panel_size(panel_config)
        grid_width = self.defaults.get('layout', {}).get('grid_width', 24)
        
        # Explicit position
        if 'pos' in panel_config:
            pos = panel_config['pos']
            return {"x": pos[0], "y": pos[1], "w": pos[2], "h": pos[3]}
        
        # Check if panel fits on current row
        if self.current_x + width > grid_width:
            self.current_x = 0
            self.current_y += self.row_max_height  # Move Y by max height of previous row
            self.row_max_height = 0  # Reset for new row
        
        # Track max height in current row
        self.row_max_height = max(self.row_max_height, height)
        
        grid_pos = {
            "x": self.current_x,
            "y": self.current_y,
            "w": width,
            "h": height
        }
        
        self.current_x += width
        
        return grid_pos
    
    def _build_field_config(self, panel_config: Dict) -> Dict:
        """Build fieldConfig object"""
        defaults_cfg = {}
        
        # Unit
        unit = self._resolve_unit(panel_config.get('unit'))
        if unit:
            defaults_cfg["unit"] = unit
            if unit == "percent":
                defaults_cfg["min"] = panel_config.get('min', 0)
                defaults_cfg["max"] = panel_config.get('max', 100)
        
        # Decimals
        if 'decimals' in panel_config:
            defaults_cfg["decimals"] = panel_config['decimals']
        
        # Min/Max
        if 'min' in panel_config:
            defaults_cfg["min"] = panel_config['min']
        if 'max' in panel_config:
            defaults_cfg["max"] = panel_config['max']
        
        # Thresholds
        thresholds = self._resolve_thresholds(panel_config.get('thresholds'))
        if thresholds:
            defaults_cfg["thresholds"] = thresholds
            defaults_cfg["color"] = {"mode": "thresholds"}
        else:
            # Note: color_mode in YAML is for options.colorMode (stat panels: value/background/none)
            # fieldConfig.defaults.color.mode must be a valid color source: palette-classic, fixed, thresholds
            if panel_config.get('color'):
                defaults_cfg["color"] = {"mode": "fixed", "fixedColor": panel_config['color']}
            else:
                defaults_cfg["color"] = {"mode": "palette-classic"}
        
        # Mappings
        mappings = self._resolve_mappings(panel_config.get('mappings'))
        if mappings:
            defaults_cfg["mappings"] = mappings
        
        # NoValue
        no_value = panel_config.get('no_value', self.defaults.get('field_config', {}).get('no_value', '0'))
        defaults_cfg["noValue"] = no_value
        
        panel_type = panel_config.get('type', 'stat')
        
        # For stat/gauge panels, set displayName to panel title to override raw series names
        instant_types = ['stat', 'gauge', 'piechart', 'pie', 'bargauge']
        if panel_type in instant_types:
            # Use panel title or a space to hide the raw series name
            title = panel_config.get('title', '')
            defaults_cfg["displayName"] = title if title else " "
        
        # Timeseries custom config
        if panel_type == 'timeseries':
            ts_defaults = self.defaults.get('panels', {}).get('timeseries', {})
            custom = {
                "drawStyle": panel_config.get('draw_style', ts_defaults.get('draw_style', 'line')),
                "fillOpacity": panel_config.get('fill_opacity', ts_defaults.get('fill_opacity', 20)),
                "lineWidth": panel_config.get('line_width', ts_defaults.get('line_width', 2)),
                "spanNulls": panel_config.get('span_nulls', ts_defaults.get('span_nulls', True)),
                "gradientMode": panel_config.get('gradient_mode', ts_defaults.get('gradient_mode', 'none')),
                "showPoints": panel_config.get('show_points', ts_defaults.get('show_points', 'never')),
                "pointSize": panel_config.get('point_size', ts_defaults.get('point_size', 5)),
            }
            
            # Stacking
            stacking = panel_config.get('stacking', panel_config.get('stack'))
            if stacking and stacking != 'none':
                custom["stacking"] = {"mode": "normal", "group": "A"}
            
            defaults_cfg["custom"] = custom
        
        return {"defaults": defaults_cfg}
    
    def _build_options(self, panel_config: Dict) -> Dict:
        """Build panel options based on type"""
        panel_type = panel_config.get('type', 'stat')
        type_defaults = self.defaults.get('panels', {}).get(panel_type, {})
        options = {}
        
        if panel_type == 'stat':
            options = {
                "colorMode": panel_config.get('color_mode', type_defaults.get('color_mode', 'background')),
                "graphMode": panel_config.get('graph_mode', type_defaults.get('graph_mode', 'area')),
                "textMode": panel_config.get('text_mode', type_defaults.get('text_mode', 'value')),
                "orientation": panel_config.get('orientation', type_defaults.get('orientation', 'horizontal')),
                "justifyMode": panel_config.get('justify_mode', type_defaults.get('justify_mode', 'auto')),
                "reduceOptions": {"calcs": panel_config.get('reduce_calcs', type_defaults.get('reduce_calcs', ['lastNotNull']))}
            }
        
        elif panel_type == 'gauge':
            options = {
                "showThresholdLabels": panel_config.get('show_threshold_labels', type_defaults.get('show_threshold_labels', False)),
                "showThresholdMarkers": panel_config.get('show_threshold_markers', type_defaults.get('show_threshold_markers', True)),
                "orientation": panel_config.get('orientation', type_defaults.get('orientation', 'auto')),
                "reduceOptions": {"calcs": panel_config.get('reduce_calcs', type_defaults.get('reduce_calcs', ['lastNotNull']))},
                "text": {}  # Hide series name text - show only value
            }
        
        elif panel_type == 'timeseries':
            legend_display = panel_config.get('legend_display', type_defaults.get('legend_display', 'list'))
            legend_placement = panel_config.get('legend_placement', type_defaults.get('legend_placement', 'bottom'))
            options = {
                "legend": {"displayMode": legend_display, "placement": legend_placement},
                "tooltip": {"mode": panel_config.get('tooltip_mode', type_defaults.get('tooltip_mode', 'multi'))}
            }
        
        elif panel_type in ['piechart', 'pie']:
            legend_values = panel_config.get('legend_values', type_defaults.get('legend_values', ['value', 'percent']))
            options = {
                "pieType": panel_config.get('pie_type', type_defaults.get('pie_type', 'donut')),
                "legend": {
                    "displayMode": panel_config.get('legend_display', type_defaults.get('legend_display', 'table')),
                    "placement": panel_config.get('legend_placement', type_defaults.get('legend_placement', 'right')),
                    "values": legend_values
                },
                "reduceOptions": {"calcs": panel_config.get('reduce_calcs', type_defaults.get('reduce_calcs', ['lastNotNull']))}
            }
        
        elif panel_type == 'bargauge':
            options = {
                "displayMode": panel_config.get('display_mode', type_defaults.get('display_mode', 'gradient')),
                "orientation": panel_config.get('orientation', type_defaults.get('orientation', 'horizontal')),
                "showUnfilled": panel_config.get('show_unfilled', type_defaults.get('show_unfilled', True)),
                "reduceOptions": {"calcs": panel_config.get('reduce_calcs', type_defaults.get('reduce_calcs', ['lastNotNull']))},
                "text": {}  # Hide series name text - show only value
            }
        
        elif panel_type == 'table':
            options = {
                "showHeader": panel_config.get('show_header', type_defaults.get('show_header', True)),
                "cellHeight": panel_config.get('cell_height', type_defaults.get('cell_height', 'sm'))
            }
        
        elif panel_type == 'text':
            options = {
                "mode": "markdown",
                "content": panel_config.get('content', panel_config.get('text', ''))
            }
        
        return options
    
    def _build_panel(self, panel_config: Dict, variables: Dict) -> Dict:
        """Build a complete panel JSON object"""
        panel_type = panel_config.get('type', 'stat')
        
        # Handle row panels
        if panel_type == 'row' or 'row' in panel_config:
            row_title = panel_config.get('row', panel_config.get('title', 'Row'))
            self.current_x = 0
            # Advance Y by max height of previous row (if any panels were placed)
            if self.row_max_height > 0:
                self.current_y += self.row_max_height
            self.row_max_height = 0  # Reset for new row
            row_y = self.current_y
            self.current_y += 1  # Row takes 1 unit of height
            return {
                "id": self.panel_id,
                "title": row_title,
                "type": "row",
                "gridPos": {"h": 1, "w": 24, "x": 0, "y": row_y},
                "collapsed": panel_config.get('collapsed', False)
            }
        
        # Handle text panels
        if panel_type == 'text':
            return {
                "id": self.panel_id,
                "title": panel_config.get('title', ''),
                "type": "text",
                "gridPos": self._calculate_grid_pos(panel_config),
                "options": self._build_options(panel_config)
            }
        
        # Map type aliases
        type_map = {'pie': 'piechart'}
        grafana_type = type_map.get(panel_type, panel_type)
        
        # Build datasource
        datasource = {
            "type": self.defaults.get('datasource', {}).get('type', 'prometheus'),
            "uid": self.defaults.get('datasource', {}).get('uid', 'prometheus')
        }
        
        targets = self._build_targets(panel_config, variables)
        
        panel = {
            "id": self.panel_id,
            "title": panel_config.get('title', 'Panel'),
            "type": grafana_type,
            "gridPos": self._calculate_grid_pos(panel_config),
            "datasource": datasource,
            "targets": targets,
            "fieldConfig": self._build_field_config(panel_config),
            "options": self._build_options(panel_config)
        }
        
        # Add description if present
        if panel_config.get('description'):
            panel["description"] = panel_config['description']
        
        # Add transformations for table panels with multiple queries
        if grafana_type == 'table' and len(targets) > 1:
            panel["transformations"] = [
                {
                    "id": "merge",
                    "options": {}
                }
            ]
        
        return panel
    
    def generate(self, yaml_file: Path) -> Dict:
        """Generate Grafana dashboard JSON from YAML file"""
        with open(yaml_file, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
        
        # Reset state
        self.current_y = 0
        self.current_x = 0
        self.row_max_height = 0
        self.panel_id = 0
        
        # Get dashboard metadata
        dashboard_defaults = self.defaults.get('dashboard', {})
        variables = config.get('vars', config.get('variables', {}))
        
        # Build panels
        panels = []
        
        # Handle row-based structure
        if 'rows' in config:
            for row in config['rows']:
                if row.get('title'):
                    self.panel_id += 1
                    self.current_x = 0
                    # Advance Y by max height of previous row (if any panels were placed)
                    if self.row_max_height > 0:
                        self.current_y += self.row_max_height
                    self.row_max_height = 0  # Reset for new row
                    row_y = self.current_y
                    panels.append({
                        "id": self.panel_id,
                        "title": row['title'],
                        "type": "row",
                        "gridPos": {"h": 1, "w": 24, "x": 0, "y": row_y},
                        "collapsed": row.get('collapsed', False)
                    })
                    self.current_y += 1
                
                for panel_config in row.get('panels', []):
                    self.panel_id += 1
                    panels.append(self._build_panel(panel_config, variables))
                
                # Move to next row
                self.current_x = 0
        
        # Handle flat panel structure
        elif 'panels' in config:
            for panel_config in config['panels']:
                self.panel_id += 1
                
                # Check for row marker
                if 'row' in panel_config or panel_config.get('type') == 'row':
                    self.current_x = 0
                    # Advance Y by max height of previous row (if any panels were placed)
                    if self.row_max_height > 0:
                        self.current_y += self.row_max_height
                    self.row_max_height = 0  # Reset for new row
                    row_title = panel_config.get('row', panel_config.get('title', 'Row'))
                    row_y = self.current_y
                    panels.append({
                        "id": self.panel_id,
                        "title": row_title,
                        "type": "row",
                        "gridPos": {"h": 1, "w": 24, "x": 0, "y": row_y},
                        "collapsed": panel_config.get('collapsed', False)
                    })
                    self.current_y += 1
                else:
                    panels.append(self._build_panel(panel_config, variables))
        
        # Build dashboard
        dashboard = {
            "title": config.get('title', 'Dashboard'),
            "uid": config.get('uid', yaml_file.stem),
            "tags": config.get('tags', []),
            "timezone": config.get('timezone', dashboard_defaults.get('timezone', 'browser')),
            "schemaVersion": dashboard_defaults.get('schema_version', 38),
            "version": config.get('version', 1),
            "refresh": config.get('refresh', dashboard_defaults.get('refresh', '10s')),
            "editable": config.get('editable', dashboard_defaults.get('editable', True)),
            "panels": panels,
            "templating": {"list": []},
            "annotations": {"list": []},
            "time": {
                "from": config.get('time_from', 'now-1h'),
                "to": config.get('time_to', 'now')
            }
        }
        
        return dashboard
    
    def generate_all(self):
        """Generate all dashboards from YAML files"""
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        
        yaml_files = list(DASHBOARDS_DIR.glob("*.yaml")) + list(DASHBOARDS_DIR.glob("*.yml"))
        
        if not yaml_files:
            print(f"No YAML files found in {DASHBOARDS_DIR}")
            return
        
        for yaml_file in yaml_files:
            if yaml_file.name.startswith('_'):
                continue  # Skip files starting with underscore
            
            print(f"Generating: {yaml_file.name}")
            try:
                dashboard = self.generate(yaml_file)
                output_file = OUTPUT_DIR / f"{yaml_file.stem}.json"
                
                with open(output_file, 'w', encoding='utf-8') as f:
                    json.dump(dashboard, f, indent=2)
                
                print(f"  -> {output_file.name}")
            except Exception as e:
                print(f"  ERROR: {e}")
        
        print(f"\nGenerated {len(yaml_files)} dashboards to {OUTPUT_DIR}")


def main():
    generator = DashboardGenerator()
    
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        
        if arg == '--validate':
            print("Validation not yet implemented")
            return
        
        # Generate specific dashboard
        yaml_file = DASHBOARDS_DIR / f"{arg}.yaml"
        if not yaml_file.exists():
            yaml_file = DASHBOARDS_DIR / f"{arg}.yml"
        
        if yaml_file.exists():
            print(f"Generating: {yaml_file.name}")
            dashboard = generator.generate(yaml_file)
            output_file = OUTPUT_DIR / f"{yaml_file.stem}.json"
            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
            
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(dashboard, f, indent=2)
            
            print(f"Generated: {output_file}")
        else:
            print(f"Dashboard not found: {arg}")
    else:
        # Generate all dashboards
        generator.generate_all()


if __name__ == "__main__":
    main()
