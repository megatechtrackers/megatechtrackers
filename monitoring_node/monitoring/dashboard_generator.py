"""
Dashboard HTML generator for monitoring server
"""
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from config import Config, ServerParams


def get_dashboard_html() -> str:
    """Get dashboard HTML content"""
    try:
        config = Config.load()
        monitoring_config = config.get('monitoring', {})
        update_interval = monitoring_config.get('update_interval_seconds', 2) * 1000
        dashboard_title = monitoring_config.get('dashboard_title', 'Fleet Monitoring')
    except:
        update_interval = 2000  # Default 2 seconds
        dashboard_title = 'Fleet Service'
    
    # Try to read modular UI files
    ui_dir = os.path.join(os.path.dirname(__file__), 'ui')
    html_path = os.path.join(ui_dir, 'dashboard.html')
    css_path = os.path.join(ui_dir, 'dashboard.css')
    js_path = os.path.join(ui_dir, 'dashboard.js')
    
    if os.path.exists(html_path) and os.path.exists(css_path) and os.path.exists(js_path):
        # Read modular files
        with open(html_path, 'r', encoding='utf-8') as f:
            html = f.read()
        with open(css_path, 'r', encoding='utf-8') as f:
            css = f.read()
        with open(js_path, 'r', encoding='utf-8') as f:
            js = f.read()
        
        # Replace placeholders
        html = html.replace('__DASHBOARD_TITLE__', dashboard_title)
        js = js.replace('__UPDATE_INTERVAL__', str(update_interval))
        
        # Embed CSS and JS inline
        html = html.replace(
            '<link rel="stylesheet" href="/ui/dashboard.css">',
            f'<style>{css}</style>'
        )
        html = html.replace(
            '<script src="/ui/dashboard.js"></script>',
            f'<script>{js}</script>'
        )
        
        return html
    else:
        # Fallback to inline HTML if files don't exist
        return get_inline_dashboard_html()


def get_inline_dashboard_html() -> str:
    """Get inline dashboard HTML (fallback)"""
    try:
        config = Config.load()
        monitoring_config = config.get('monitoring', {})
        update_interval = monitoring_config.get('update_interval_seconds', 2) * 1000
        dashboard_title = monitoring_config.get('dashboard_title', 'Fleet Monitoring')
    except:
        update_interval = 2000  # Default 2 seconds
        dashboard_title = 'Fleet Service'
    
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{dashboard_title}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        :root {{
            --bg-primary: #f8f9fa;
            --bg-card: #ffffff;
            --bg-sidebar: #1e293b;
            --bg-header: #0f172a;
            --text-primary: #1e293b;
            --text-secondary: #64748b;
            --text-muted: #94a3b8;
            --border-color: #e2e8f0;
            --accent-primary: #3b82f6;
            --accent-success: #22c55e;
            --accent-warning: #f59e0b;
            --accent-danger: #ef4444;
        }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            font-size: 14px;
            line-height: 1.5;
            height: 100vh;
            overflow: hidden;
        }}
        
        /* Layout */
        .layout {{
            display: flex;
            height: 100vh;
        }}
        
        /* Sidebar */
        .sidebar {{
            width: 280px;
            background: var(--bg-sidebar);
            color: white;
            display: flex;
            flex-direction: column;
            flex-shrink: 0;
        }}
        .sidebar-header {{
            padding: 20px;
            background: var(--bg-header);
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }}
        .sidebar-title {{
            font-size: 1.1rem;
            font-weight: 600;
        }}
        .sidebar-subtitle {{
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-top: 4px;
        }}
        .sidebar-stats {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            padding: 16px 20px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }}
        .sidebar-stat {{
            text-align: center;
            padding: 12px 8px;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
        }}
        .sidebar-stat-value {{
            font-size: 1.5rem;
            font-weight: 700;
        }}
        .sidebar-stat-label {{
            font-size: 0.65rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-top: 2px;
        }}
        .status-dot {{
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 8px;
            animation: pulse 2s infinite;
        }}
        .status-dot.healthy {{ background: var(--accent-success); }}
        .status-dot.degraded {{ background: var(--accent-warning); }}
        .status-dot.unhealthy {{ background: var(--accent-danger); }}
        @keyframes pulse {{
            0%, 100% {{ opacity: 1; }}
            50% {{ opacity: 0.5; }}
        }}
        
        /* Node List */
        .node-list-header {{
            padding: 16px 20px 12px;
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--text-muted);
        }}
        .node-list {{
            flex: 1;
            overflow-y: auto;
            padding: 0 12px 12px;
        }}
        .node-item {{
            padding: 12px 14px;
            margin-bottom: 6px;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.15s;
            background: rgba(255,255,255,0.03);
            border: 1px solid transparent;
        }}
        .node-item:hover {{
            background: rgba(255,255,255,0.08);
        }}
        .node-item.selected {{
            background: var(--accent-primary);
            border-color: var(--accent-primary);
        }}
        .node-item-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        .node-name {{
            font-weight: 500;
            font-size: 0.85rem;
        }}
        .node-badge {{
            font-size: 0.65rem;
            padding: 2px 6px;
            border-radius: 3px;
            text-transform: uppercase;
            font-weight: 600;
        }}
        .node-badge.healthy {{ background: rgba(34,197,94,0.2); color: #4ade80; }}
        .node-badge.warning {{ background: rgba(245,158,11,0.2); color: #fbbf24; }}
        .node-badge.critical {{ background: rgba(239,68,68,0.2); color: #f87171; }}
        .node-meta {{
            display: flex;
            gap: 12px;
            margin-top: 6px;
            font-size: 0.7rem;
            color: var(--text-muted);
        }}
        
        /* Main Content */
        .main {{
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }}
        .main-header {{
            padding: 16px 24px;
            background: var(--bg-card);
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        .main-title {{
            font-size: 1.1rem;
            font-weight: 600;
        }}
        .main-meta {{
            font-size: 0.8rem;
            color: var(--text-secondary);
        }}
        .main-content {{
            flex: 1;
            overflow-y: auto;
            padding: 24px;
        }}
        
        /* Overview Grid */
        .overview-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }}
        .stat-card {{
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 20px;
        }}
        .stat-label {{
            font-size: 0.75rem;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }}
        .stat-value {{
            font-size: 2rem;
            font-weight: 700;
            margin-top: 4px;
            font-variant-numeric: tabular-nums;
        }}
        .stat-hint {{
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-top: 4px;
        }}
        
        /* Charts */
        .chart-grid {{
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
        }}
        .chart-card {{
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 20px;
            min-width: 0; /* Prevent grid blowout */
        }}
        .chart-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }}
        .chart-title {{
            font-weight: 600;
            font-size: 0.9rem;
        }}
        .chart-container {{
            position: relative;
            width: 100%;
            height: 0;
            padding-bottom: 50%; /* 2:1 aspect ratio */
        }}
        .chart-container canvas {{
            position: absolute;
            top: 0;
            left: 0;
            width: 100% !important;
            height: 100% !important;
        }}
        
        /* Node Detail View */
        .node-detail {{
            display: none;
        }}
        .node-detail.active {{
            display: block;
        }}
        .detail-header {{
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 24px;
        }}
        .detail-back {{
            padding: 8px 12px;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.85rem;
            color: var(--text-secondary);
        }}
        .detail-back:hover {{
            background: var(--border-color);
        }}
        .detail-title {{
            font-size: 1.25rem;
            font-weight: 600;
        }}
        .detail-badge {{
            font-size: 0.7rem;
            padding: 4px 10px;
            border-radius: 4px;
            text-transform: uppercase;
            font-weight: 600;
        }}
        .detail-badge.healthy {{ background: rgba(34,197,94,0.1); color: var(--accent-success); }}
        .detail-badge.warning {{ background: rgba(245,158,11,0.1); color: var(--accent-warning); }}
        .detail-badge.critical {{ background: rgba(239,68,68,0.1); color: var(--accent-danger); }}
        .detail-stats {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }}
        .detail-stat {{
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 16px;
        }}
        .detail-stat-label {{
            font-size: 0.7rem;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }}
        .detail-stat-value {{
            font-size: 1.5rem;
            font-weight: 700;
            margin-top: 4px;
        }}
        
        /* Alerts */
        .alerts-section {{
            margin-top: 24px;
        }}
        .alerts-title {{
            font-weight: 600;
            margin-bottom: 12px;
        }}
        .alert {{
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 12px;
        }}
        .alert.warning {{
            background: rgba(245,158,11,0.1);
            border-left: 3px solid var(--accent-warning);
        }}
        .alert.error {{
            background: rgba(239,68,68,0.1);
            border-left: 3px solid var(--accent-danger);
        }}
        .alert-ok {{
            color: var(--accent-success);
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        
        /* Data Mode Badge */
        .data-mode {{
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            background: rgba(59,130,246,0.1);
            color: var(--accent-primary);
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
        }}
        
        /* Scrollbar */
        ::-webkit-scrollbar {{ width: 6px; }}
        ::-webkit-scrollbar-track {{ background: transparent; }}
        ::-webkit-scrollbar-thumb {{ background: rgba(255,255,255,0.2); border-radius: 3px; }}
        .main-content::-webkit-scrollbar-thumb {{ background: var(--border-color); }}
        
        /* Mobile Menu Toggle */
        .mobile-toggle {{
            display: none;
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: var(--accent-primary);
            color: white;
            border: none;
            cursor: pointer;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            align-items: center;
            justify-content: center;
        }}
        .mobile-toggle svg {{ width: 24px; height: 24px; }}
        
        /* Responsive - Large Desktop */
        @media (min-width: 1400px) {{
            .chart-grid {{ grid-template-columns: repeat(2, 1fr); }}
            .chart-container {{ padding-bottom: 45%; }}
        }}
        
        /* Responsive - Tablet */
        @media (max-width: 1200px) {{
            .chart-grid {{ grid-template-columns: 1fr; gap: 16px; }}
            .chart-container {{ padding-bottom: 40%; }}
        }}
        
        @media (max-width: 1024px) {{
            .sidebar {{ width: 240px; }}
            .overview-grid {{ grid-template-columns: repeat(2, 1fr); }}
            .detail-stats {{ grid-template-columns: repeat(3, 1fr); }}
            .main-content {{ padding: 16px; }}
            .stat-value {{ font-size: 1.5rem; }}
            .chart-container {{ padding-bottom: 50%; }}
        }}
        
        /* Responsive - Mobile */
        @media (max-width: 768px) {{
            .layout {{ flex-direction: column; height: auto; min-height: 100vh; }}
            
            .sidebar {{
                position: fixed;
                top: 0;
                left: -100%;
                width: 85%;
                max-width: 320px;
                height: 100vh;
                z-index: 999;
                transition: left 0.3s ease;
                box-shadow: 4px 0 20px rgba(0,0,0,0.3);
            }}
            .sidebar.open {{ left: 0; }}
            
            .sidebar-overlay {{
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 998;
            }}
            .sidebar-overlay.open {{ display: block; }}
            
            .mobile-toggle {{ display: flex; }}
            
            .main {{
                width: 100%;
                height: auto;
                min-height: 100vh;
            }}
            
            .main-header {{
                padding: 12px 16px;
                flex-wrap: wrap;
                gap: 8px;
            }}
            .main-title {{ font-size: 1rem; }}
            
            .main-content {{ 
                padding: 12px;
                overflow-y: visible;
            }}
            
            .overview-grid {{
                grid-template-columns: repeat(2, 1fr);
                gap: 10px;
                margin-bottom: 16px;
            }}
            .stat-card {{ padding: 14px; }}
            .stat-value {{ font-size: 1.25rem; }}
            .stat-label {{ font-size: 0.65rem; }}
            .stat-hint {{ display: none; }}
            
            .chart-grid {{ 
                grid-template-columns: 1fr;
                gap: 12px;
            }}
            .chart-card {{ padding: 14px; }}
            .chart-container {{ padding-bottom: 55%; }}
            
            .detail-stats {{
                grid-template-columns: repeat(2, 1fr);
                gap: 10px;
            }}
            .detail-stat {{ padding: 12px; }}
            .detail-stat-value {{ font-size: 1.25rem; }}
            
            .detail-header {{
                flex-wrap: wrap;
                gap: 8px;
            }}
            .detail-title {{ font-size: 1rem; }}
            
            .alerts-section {{ margin-top: 16px; }}
            .alert {{ padding: 10px 12px; font-size: 0.85rem; }}
            
            body {{ overflow: auto; }}
        }}
        
        /* Responsive - Small Mobile */
        @media (max-width: 480px) {{
            .overview-grid {{ grid-template-columns: 1fr 1fr; gap: 8px; }}
            .stat-card {{ padding: 12px 10px; }}
            .stat-value {{ font-size: 1.1rem; }}
            
            .sidebar-stats {{ gap: 8px; padding: 12px 16px; }}
            .sidebar-stat {{ padding: 10px 6px; }}
            .sidebar-stat-value {{ font-size: 1.25rem; }}
            
            .detail-stats {{ grid-template-columns: repeat(2, 1fr); }}
            .chart-container {{ padding-bottom: 65%; }}
        }}
    </style>
</head>
<body>
    <!-- Mobile Overlay -->
    <div class="sidebar-overlay" id="sidebar-overlay" onclick="closeSidebar()"></div>
    
    <!-- Mobile Toggle Button -->
    <button class="mobile-toggle" id="mobile-toggle" onclick="toggleSidebar()">
        <svg fill="currentColor" viewBox="0 0 16 16">
            <path fill-rule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"/>
        </svg>
    </button>
    
    <div class="layout">
        <!-- Sidebar -->
        <aside class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <div class="sidebar-title">{dashboard_title}</div>
                <div class="sidebar-subtitle">
                    <span class="status-dot healthy" id="status-dot"></span>
                    <span id="status-text">Healthy</span> · Uptime: <span id="uptime">0m</span>
                </div>
            </div>
            
            <div class="sidebar-stats">
                <div class="sidebar-stat">
                    <div class="sidebar-stat-value" id="trackers-count">0</div>
                    <div class="sidebar-stat-label">Trackers Online</div>
                </div>
                <div class="sidebar-stat">
                    <div class="sidebar-stat-value" id="nodes-count">0</div>
                    <div class="sidebar-stat-label">Parser Services</div>
                </div>
            </div>
            
            <div class="node-list-header">Parser Services</div>
            <div class="node-list" id="node-list">
                <div style="padding: 20px; text-align: center; color: var(--text-muted);">Loading...</div>
            </div>
        </aside>
        
        <!-- Main Content -->
        <main class="main">
            <div class="main-header">
                <div>
                    <div class="main-title" id="view-title">Fleet Overview</div>
                    <div class="main-meta">Aggregated metrics from all parser services</div>
                </div>
                <div class="data-mode" id="data-mode">
                    <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm3.5 7.5a.5.5 0 0 1 0 1H5.707l2.147 2.146a.5.5 0 0 1-.708.708l-3-3a.5.5 0 0 1 0-.708l3-3a.5.5 0 1 1 .708.708L5.707 7.5H11.5z"/></svg>
                    RabbitMQ
                </div>
            </div>
            
            <div class="main-content">
                <!-- Overview View -->
                <div id="overview-view">
                    <div class="overview-grid">
                        <div class="stat-card">
                            <div class="stat-label">Trackers Online</div>
                            <div class="stat-value" id="stat-trackers">0</div>
                            <div class="stat-hint">Currently connected devices</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Connection Attempts</div>
                            <div class="stat-value" id="stat-attempts">0</div>
                            <div class="stat-hint">Total since startup</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Rejected</div>
                            <div class="stat-value" id="stat-rejected">0</div>
                            <div class="stat-hint">Connections refused</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Total Capacity</div>
                            <div class="stat-value" id="stat-capacity">0</div>
                            <div class="stat-hint">Max concurrent trackers</div>
                        </div>
                    </div>
                    
                    <div class="chart-grid">
                        <div class="chart-card">
                            <div class="chart-header">
                                <span class="chart-title">Parser Services CPU Usage</span>
                            </div>
                            <div class="chart-container">
                                <canvas id="cpu-chart"></canvas>
                            </div>
                        </div>
                        <div class="chart-card">
                            <div class="chart-header">
                                <span class="chart-title">Parser Services Memory Usage</span>
                            </div>
                            <div class="chart-container">
                                <canvas id="memory-chart"></canvas>
                            </div>
                        </div>
                    </div>
                    
                    <div class="alerts-section">
                        <div class="alerts-title">System Alerts</div>
                        <div id="alerts-container">
                            <div class="alert-ok">
                                <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
                                </svg>
                                All systems operational
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Node Detail View -->
                <div id="node-detail-view" class="node-detail">
                    <div class="detail-header">
                        <button class="detail-back" onclick="showOverview()">← Back</button>
                        <div class="detail-title" id="detail-node-name">Node</div>
                        <span class="detail-badge healthy" id="detail-node-status">Healthy</span>
                    </div>
                    
                    <div class="detail-stats" id="detail-stats"></div>
                    
                    <div class="chart-grid">
                        <div class="chart-card">
                            <div class="chart-header">
                                <span class="chart-title">CPU Usage Over Time</span>
                            </div>
                            <div class="chart-container">
                                <canvas id="node-cpu-chart"></canvas>
                            </div>
                        </div>
                        <div class="chart-card">
                            <div class="chart-header">
                                <span class="chart-title">Memory Usage Over Time</span>
                            </div>
                            <div class="chart-container">
                                <canvas id="node-memory-chart"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </div>
    
    <script>
        const UPDATE_INTERVAL = {update_interval};
        const MAX_HISTORY = 30;
        
        let cpuChart, memoryChart, nodeCpuChart, nodeMemoryChart;
        let nodesData = {{}};
        let nodeHistory = {{}};
        let selectedNode = null;
        
        function initCharts() {{
            const chartConfig = (label, color) => ({{
                type: 'line',
                data: {{ labels: [], datasets: [] }},
                options: {{
                    responsive: true,
                    maintainAspectRatio: false,
                    resizeDelay: 100,
                    animation: {{ duration: 0 }},
                    plugins: {{
                        legend: {{ 
                            display: true, 
                            position: 'top', 
                            labels: {{ 
                                usePointStyle: true, 
                                boxWidth: 6, 
                                font: {{ size: window.innerWidth < 768 ? 8 : 10 }},
                                padding: window.innerWidth < 768 ? 8 : 12
                            }} 
                        }},
                        tooltip: {{ mode: 'index', intersect: false }}
                    }},
                    scales: {{
                        x: {{ 
                            display: true, 
                            grid: {{ display: false }}, 
                            ticks: {{ 
                                maxTicksLimit: window.innerWidth < 768 ? 4 : 6, 
                                font: {{ size: window.innerWidth < 768 ? 8 : 9 }} 
                            }} 
                        }},
                        y: {{ 
                            beginAtZero: true, 
                            max: 100, 
                            grid: {{ color: 'rgba(0,0,0,0.05)' }}, 
                            ticks: {{ 
                                callback: v => v + '%', 
                                font: {{ size: window.innerWidth < 768 ? 8 : 9 }},
                                maxTicksLimit: 5
                            }} 
                        }}
                    }},
                    interaction: {{ mode: 'nearest', axis: 'x', intersect: false }},
                    layout: {{
                        padding: {{ top: 5, bottom: 5, left: 0, right: 5 }}
                    }}
                }}
            }});
            
            cpuChart = new Chart(document.getElementById('cpu-chart'), chartConfig('CPU', '#3b82f6'));
            memoryChart = new Chart(document.getElementById('memory-chart'), chartConfig('Memory', '#22c55e'));
            nodeCpuChart = new Chart(document.getElementById('node-cpu-chart'), chartConfig('CPU', '#3b82f6'));
            nodeMemoryChart = new Chart(document.getElementById('node-memory-chart'), chartConfig('Memory', '#22c55e'));
        }}
        
        // Debounced resize handler for charts
        let resizeTimeout;
        function handleResize() {{
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {{
                if (cpuChart) cpuChart.resize();
                if (memoryChart) memoryChart.resize();
                if (nodeCpuChart) nodeCpuChart.resize();
                if (nodeMemoryChart) nodeMemoryChart.resize();
            }}, 150);
        }}
        
        function updateNodeList() {{
            fetch('/api/parser-nodes/status')
                .then(r => r.json())
                .then(data => {{
                    const nodes = data.parser_nodes || [];
                    const container = document.getElementById('node-list');
                    document.getElementById('nodes-count').textContent = nodes.length;
                    
                    // Calculate totals
                    let totalTrackers = 0;
                    nodes.forEach(n => {{
                        totalTrackers += n.load?.active_connections || 0;
                        nodesData[n.node_id] = n;
                        
                        // Track history
                        if (!nodeHistory[n.node_id]) nodeHistory[n.node_id] = [];
                        nodeHistory[n.node_id].push({{
                            time: new Date().toLocaleTimeString('en-US', {{hour: '2-digit', minute: '2-digit'}}),
                            cpu: n.load?.cpu_usage || 0,
                            memory: n.load?.memory_usage_percent || 0
                        }});
                        if (nodeHistory[n.node_id].length > MAX_HISTORY) {{
                            nodeHistory[n.node_id] = nodeHistory[n.node_id].slice(-MAX_HISTORY);
                        }}
                    }});
                    
                    document.getElementById('trackers-count').textContent = totalTrackers;
                    
                    if (nodes.length === 0) {{
                        container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No nodes reporting</div>';
                        return;
                    }}
                    
                    let html = '';
                    nodes.forEach(node => {{
                        const load = node.load || {{}};
                        const isSelected = selectedNode === node.node_id;
                        html += `
                            <div class="node-item${{isSelected ? ' selected' : ''}}" onclick="selectNodeMobile('${{node.node_id}}')">
                                <div class="node-item-header">
                                    <span class="node-name">${{node.node_id}}</span>
                                    <span class="node-badge ${{node.status}}">${{node.status}}</span>
                                </div>
                                <div class="node-meta">
                                    <span>${{load.active_connections || 0}} trackers</span>
                                    <span>CPU ${{(load.cpu_usage || 0).toFixed(0)}}%</span>
                                    <span>Mem ${{(load.memory_usage_percent || 0).toFixed(0)}}%</span>
                                </div>
                            </div>
                        `;
                    }});
                    container.innerHTML = html;
                    
                    // Update charts
                    updateOverviewCharts(nodes);
                    if (selectedNode && nodesData[selectedNode]) {{
                        updateNodeDetailCharts(selectedNode);
                    }}
                }})
                .catch(e => console.error('Error:', e));
        }}
        
        function updateOverviewCharts(nodes) {{
            const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
            const time = new Date().toLocaleTimeString('en-US', {{hour: '2-digit', minute: '2-digit'}});
            
            // Build datasets from all nodes
            const cpuDatasets = [];
            const memDatasets = [];
            
            nodes.forEach((node, i) => {{
                const history = nodeHistory[node.node_id] || [];
                const color = colors[i % colors.length];
                
                cpuDatasets.push({{
                    label: node.node_id.replace(/-parser-/g, '-P').replace(/^[a-z]+-/, ''),
                    data: history.map(h => h.cpu),
                    borderColor: color,
                    backgroundColor: color + '20',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 0
                }});
                
                memDatasets.push({{
                    label: node.node_id.replace(/-parser-/g, '-P').replace(/^[a-z]+-/, ''),
                    data: history.map(h => h.memory),
                    borderColor: color,
                    backgroundColor: color + '20',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 0
                }});
            }});
            
            const labels = (nodeHistory[nodes[0]?.node_id] || []).map(h => h.time);
            
            cpuChart.data.labels = labels;
            cpuChart.data.datasets = cpuDatasets;
            cpuChart.update('none');
            
            memoryChart.data.labels = labels;
            memoryChart.data.datasets = memDatasets;
            memoryChart.update('none');
        }}
        
        function updateNodeDetailCharts(nodeId) {{
            const history = nodeHistory[nodeId] || [];
            const labels = history.map(h => h.time);
            
            nodeCpuChart.data.labels = labels;
            nodeCpuChart.data.datasets = [{{
                label: 'CPU %',
                data: history.map(h => h.cpu),
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59,130,246,0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointRadius: 0
            }}];
            nodeCpuChart.update('none');
            
            nodeMemoryChart.data.labels = labels;
            nodeMemoryChart.data.datasets = [{{
                label: 'Memory %',
                data: history.map(h => h.memory),
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34,197,94,0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointRadius: 0
            }}];
            nodeMemoryChart.update('none');
        }}
        
        function updateDashboard() {{
            fetch('/status')
                .then(r => r.json())
                .then(data => {{
                    // Status
                    const hasAlerts = (data.alerts || []).length > 0;
                    const health = data.server?.status === 'running' ? (hasAlerts ? 'degraded' : 'healthy') : 'unhealthy';
                    document.getElementById('status-dot').className = 'status-dot ' + health;
                    document.getElementById('status-text').textContent = health.charAt(0).toUpperCase() + health.slice(1);
                    
                    // Uptime
                    const uptime = data.server?.uptime_seconds || 0;
                    document.getElementById('uptime').textContent = formatUptime(uptime);
                    
                    // Connection stats
                    const conn = data.connections || {{}};
                    document.getElementById('stat-trackers').textContent = conn.active || 0;
                    document.getElementById('stat-attempts').textContent = conn.total_connected || 0;
                    document.getElementById('stat-rejected').textContent = conn.total_rejected || 0;
                    document.getElementById('stat-capacity').textContent = formatNumber(conn.max_allowed || 0);
                    
                    // Alerts
                    const alerts = data.alerts || [];
                    let alertsHtml = '';
                    if (alerts.length === 0) {{
                        alertsHtml = `<div class="alert-ok">
                            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
                            </svg>
                            All systems operational
                        </div>`;
                    }} else {{
                        alerts.forEach(alert => {{
                            alertsHtml += `<div class="alert ${{alert.level}}">${{alert.message}}</div>`;
                        }});
                    }}
                    document.getElementById('alerts-container').innerHTML = alertsHtml;
                }})
                .catch(e => console.error('Error:', e));
        }}
        
        function selectNode(nodeId) {{
            selectedNode = nodeId;
            const node = nodesData[nodeId];
            if (!node) return;
            
            // Update sidebar selection
            document.querySelectorAll('.node-item').forEach(el => {{
                el.classList.remove('selected');
                if (el.textContent.includes(nodeId)) el.classList.add('selected');
            }});
            
            // Show detail view
            document.getElementById('overview-view').style.display = 'none';
            document.getElementById('node-detail-view').classList.add('active');
            
            // Update header
            document.getElementById('view-title').textContent = nodeId;
            document.getElementById('detail-node-name').textContent = nodeId;
            document.getElementById('detail-node-status').textContent = node.status;
            document.getElementById('detail-node-status').className = 'detail-badge ' + node.status;
            
            // Update stats
            const load = node.load || {{}};
            document.getElementById('detail-stats').innerHTML = `
                <div class="detail-stat">
                    <div class="detail-stat-label">Active Trackers</div>
                    <div class="detail-stat-value">${{load.active_connections || 0}}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Capacity</div>
                    <div class="detail-stat-value">${{formatNumber(load.max_connections || 0)}}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">CPU Usage</div>
                    <div class="detail-stat-value">${{(load.cpu_usage || 0).toFixed(1)}}%</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Memory</div>
                    <div class="detail-stat-value">${{(load.memory_usage_percent || 0).toFixed(1)}}%</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Messages/sec</div>
                    <div class="detail-stat-value">${{(load.messages_per_second || 0).toFixed(1)}}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Success Rate</div>
                    <div class="detail-stat-value">${{(load.publish_success_rate || 100).toFixed(1)}}%</div>
                </div>
            `;
            
            updateNodeDetailCharts(nodeId);
        }}
        
        function showOverview() {{
            selectedNode = null;
            document.getElementById('overview-view').style.display = 'block';
            document.getElementById('node-detail-view').classList.remove('active');
            document.getElementById('view-title').textContent = 'Fleet Overview';
            document.querySelectorAll('.node-item').forEach(el => el.classList.remove('selected'));
        }}
        
        function formatUptime(seconds) {{
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            if (days > 0) return days + 'd ' + hours + 'h';
            if (hours > 0) return hours + 'h ' + minutes + 'm';
            return minutes + 'm';
        }}
        
        function formatNumber(num) {{
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
            return num.toString();
        }}
        
        // Mobile sidebar functions
        function toggleSidebar() {{
            document.getElementById('sidebar').classList.toggle('open');
            document.getElementById('sidebar-overlay').classList.toggle('open');
        }}
        
        function closeSidebar() {{
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('sidebar-overlay').classList.remove('open');
        }}
        
        // Close sidebar when selecting a node on mobile
        function selectNodeMobile(nodeId) {{
            selectNode(nodeId);
            // Close sidebar on mobile/tablet
            if (window.innerWidth <= 768) {{
                closeSidebar();
            }}
        }}
        
        // Handle window resize - close sidebar if resizing to desktop and resize charts
        window.addEventListener('resize', function() {{
            if (window.innerWidth > 768) {{
                closeSidebar();
            }}
            handleResize();
        }});
        
        // Also handle orientation change on mobile
        window.addEventListener('orientationchange', function() {{
            setTimeout(handleResize, 200);
        }});
        
        // Initialize
        initCharts();
        updateDashboard();
        updateNodeList();
        setInterval(() => {{
            updateDashboard();
            updateNodeList();
        }}, UPDATE_INTERVAL);
    </script>
</body>
</html>""".replace('{update_interval}', str(update_interval)).replace('{dashboard_title}', dashboard_title)
