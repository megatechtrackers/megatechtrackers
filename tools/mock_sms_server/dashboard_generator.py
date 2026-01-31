"""
Dashboard HTML generator for Mock SMS Server
Similar style to Monitoring for consistency
"""
import os
from datetime import datetime


def get_dashboard_html() -> str:
    """Get dashboard HTML content with Monitoring style"""
    update_interval = 5000  # 5 seconds
    
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
    
    # Fallback to inline HTML if files don't exist
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mock SMS Server - Dashboard</title>
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
        @keyframes pulse {{
            0%, 100% {{ opacity: 1; }}
            50% {{ opacity: 0.5; }}
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
            margin-bottom: 8px;
        }}
        .stat-value {{
            font-size: 2rem;
            font-weight: 700;
            color: var(--text-primary);
        }}
        .stat-hint {{
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-top: 4px;
        }}
        .stat-card.success .stat-value {{ color: var(--accent-success); }}
        .stat-card.error .stat-value {{ color: var(--accent-danger); }}
        .stat-card.warning .stat-value {{ color: var(--accent-warning); }}
        
        /* Chart Cards */
        .chart-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }}
        .chart-card {{
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 20px;
        }}
        .chart-header {{
            margin-bottom: 16px;
        }}
        .chart-title {{
            font-size: 0.9rem;
            font-weight: 600;
            color: var(--text-primary);
        }}
        .chart-container {{
            position: relative;
            height: 200px;
        }}
        
        /* Messages List */
        .messages-section {{
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 20px;
        }}
        .section-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }}
        .section-title {{
            font-size: 1rem;
            font-weight: 600;
        }}
        .toolbar {{
            display: flex;
            gap: 8px;
        }}
        button {{
            padding: 8px 16px;
            border: 1px solid var(--border-color);
            background: var(--bg-card);
            color: var(--text-primary);
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.85rem;
            transition: all 0.15s;
        }}
        button:hover {{
            background: var(--bg-primary);
        }}
        button.danger {{
            background: var(--accent-danger);
            color: white;
            border-color: var(--accent-danger);
        }}
        .search-box {{
            padding: 8px 12px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            font-size: 0.85rem;
            width: 250px;
        }}
        .messages-list {{
            display: flex;
            flex-direction: column;
            gap: 12px;
            max-height: 600px;
            overflow-y: auto;
        }}
        .message-card {{
            padding: 16px;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            border-left: 4px solid var(--accent-primary);
            transition: all 0.15s;
        }}
        .message-card:hover {{
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }}
        .message-card.success {{ border-left-color: var(--accent-success); }}
        .message-card.failed {{ border-left-color: var(--accent-danger); }}
        .message-card.rate_limited {{ border-left-color: var(--accent-warning); }}
        .message-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }}
        .message-to {{
            font-weight: 600;
            font-size: 1rem;
        }}
        .status-badge {{
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
        }}
        .status-badge.success {{
            background: rgba(34,197,94,0.1);
            color: var(--accent-success);
        }}
        .status-badge.failed {{
            background: rgba(239,68,68,0.1);
            color: var(--accent-danger);
        }}
        .status-badge.rate_limited {{
            background: rgba(245,158,11,0.1);
            color: var(--accent-warning);
        }}
        .message-body {{
            background: var(--bg-primary);
            padding: 12px;
            border-radius: 6px;
            font-family: 'Courier New', monospace;
            font-size: 0.85rem;
            white-space: pre-wrap;
            word-break: break-word;
            margin-bottom: 12px;
        }}
        .message-meta {{
            display: flex;
            gap: 16px;
            font-size: 0.75rem;
            color: var(--text-secondary);
        }}
        .empty-state {{
            text-align: center;
            padding: 60px 20px;
            color: var(--text-muted);
        }}
        .empty-state h2 {{
            margin-bottom: 8px;
            color: var(--text-secondary);
        }}
        .auto-refresh {{
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.85rem;
            color: var(--text-secondary);
        }}
    </style>
</head>
<body>
    <div class="layout">
        <!-- Sidebar -->
        <aside class="sidebar">
            <div class="sidebar-header">
                <div class="sidebar-title">Mock SMS Server</div>
                <div class="sidebar-subtitle">
                    <span class="status-dot healthy" id="status-dot"></span>
                    <span id="status-text">Running</span>
                </div>
            </div>
            
            <div class="sidebar-stats">
                <div class="sidebar-stat">
                    <div class="sidebar-stat-value" id="sidebar-total">0</div>
                    <div class="sidebar-stat-label">Total</div>
                </div>
                <div class="sidebar-stat">
                    <div class="sidebar-stat-value" id="sidebar-success">0</div>
                    <div class="sidebar-stat-label">Success</div>
                </div>
            </div>
        </aside>
        
        <!-- Main Content -->
        <main class="main">
            <div class="main-header">
                <div>
                    <div class="main-title">SMS Messages Dashboard</div>
                    <div class="main-meta">View and manage all received SMS messages</div>
                </div>
                <div class="auto-refresh">
                    <input type="checkbox" id="autoRefresh" checked>
                    <label for="autoRefresh">Auto-refresh (5s)</label>
                </div>
            </div>
            
            <div class="main-content">
                <!-- Stats Overview -->
                <div class="overview-grid">
                    <div class="stat-card">
                        <div class="stat-label">Total Received</div>
                        <div class="stat-value" id="stat-total">0</div>
                        <div class="stat-hint">All SMS messages</div>
                    </div>
                    <div class="stat-card success">
                        <div class="stat-label">Successful</div>
                        <div class="stat-value" id="stat-success">0</div>
                        <div class="stat-hint">Successfully sent</div>
                    </div>
                    <div class="stat-card error">
                        <div class="stat-label">Failed</div>
                        <div class="stat-value" id="stat-failed">0</div>
                        <div class="stat-hint">Failed to send</div>
                    </div>
                    <div class="stat-card warning">
                        <div class="stat-label">Rate Limited</div>
                        <div class="stat-value" id="stat-rate-limited">0</div>
                        <div class="stat-hint">Rate limit exceeded</div>
                    </div>
                </div>
                
                <!-- Charts -->
                <div class="chart-grid">
                    <div class="chart-card">
                        <div class="chart-header">
                            <span class="chart-title">Messages Over Time</span>
                        </div>
                        <div class="chart-container">
                            <canvas id="messages-chart"></canvas>
                        </div>
                    </div>
                    <div class="chart-card">
                        <div class="chart-header">
                            <span class="chart-title">Status Distribution</span>
                        </div>
                        <div class="chart-container">
                            <canvas id="status-chart"></canvas>
                        </div>
                    </div>
                </div>
                
                <!-- Messages List -->
                <div class="messages-section">
                    <div class="section-header">
                        <div class="section-title">Recent Messages</div>
                        <div class="toolbar">
                            <input type="text" class="search-box" id="searchBox" placeholder="Search by phone number..." onkeyup="filterMessages()">
                            <button onclick="refresh()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>Refresh</button>
                            <button class="danger" onclick="clearMessages()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>Clear All</button>
                        </div>
                    </div>
                    <div class="messages-list" id="messages-list">
                        <div class="empty-state">
                            <h2><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 8px;"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>No messages yet</h2>
                            <p>SMS messages will appear here when received.</p>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </div>
    
    <script>
        const UPDATE_INTERVAL = {update_interval};
        let messagesChart, statusChart;
        let allMessages = [];
        let autoRefreshInterval;
        
        // Initialize charts
        function initCharts() {{
            const messagesCtx = document.getElementById('messages-chart').getContext('2d');
            messagesChart = new Chart(messagesCtx, {{
                type: 'line',
                data: {{
                    labels: [],
                    datasets: [{{
                        label: 'Messages',
                        data: [],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4
                    }}]
                }},
                options: {{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {{
                        legend: {{ display: false }}
                    }},
                    scales: {{
                        y: {{ beginAtZero: true }}
                    }}
                }}
            }});
            
            const statusCtx = document.getElementById('status-chart').getContext('2d');
            statusChart = new Chart(statusCtx, {{
                type: 'doughnut',
                data: {{
                    labels: ['Success', 'Failed', 'Rate Limited'],
                    datasets: [{{
                        data: [0, 0, 0],
                        backgroundColor: [
                            '#22c55e',
                            '#ef4444',
                            '#f59e0b'
                        ]
                    }}]
                }},
                options: {{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {{
                        legend: {{ position: 'bottom' }}
                    }}
                }}
            }});
        }}
        
        async function fetchStats() {{
            try {{
                const res = await fetch('/api/stats');
                const stats = await res.json();
                
                document.getElementById('stat-total').textContent = stats.total_received || 0;
                document.getElementById('stat-success').textContent = stats.total_success || 0;
                document.getElementById('stat-failed').textContent = stats.total_failed || 0;
                document.getElementById('stat-rate-limited').textContent = stats.total_rate_limited || 0;
                
                document.getElementById('sidebar-total').textContent = stats.total_received || 0;
                document.getElementById('sidebar-success').textContent = stats.total_success || 0;
                
                // Update status chart
                if (statusChart) {{
                    statusChart.data.datasets[0].data = [
                        stats.total_success || 0,
                        stats.total_failed || 0,
                        stats.total_rate_limited || 0
                    ];
                    statusChart.update();
                }}
            }} catch (error) {{
                console.error('Error fetching stats:', error);
            }}
        }}
        
        async function fetchMessages() {{
            try {{
                const res = await fetch('/api/messages?limit=100');
                const data = await res.json();
                allMessages = data.messages || [];
                renderMessages(allMessages);
                updateMessagesChart();
            }} catch (error) {{
                console.error('Error fetching messages:', error);
            }}
        }}
        
        function renderMessages(messages) {{
            const container = document.getElementById('messages-list');
            
            if (messages.length === 0) {{
                container.innerHTML = `
                    <div class="empty-state">
                        <h2><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 8px;"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>No messages yet</h2>
                        <p>SMS messages will appear here when received.</p>
                    </div>
                `;
                return;
            }}
            
            container.innerHTML = messages.map(msg => `
                <div class="message-card ${{msg.status}}" data-phone="${{msg.to}}">
                    <div class="message-header">
                        <span class="message-to"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${{escapeHtml(msg.to)}}</span>
                        <span class="status-badge ${{msg.status}}">${{msg.status}}</span>
                    </div>
                    <div class="message-body">${{escapeHtml(msg.message)}}</div>
                    <div class="message-meta">
                        <span>From: ${{escapeHtml(msg.from_sender)}}</span>
                        <span>ID: ${{msg.id.slice(0, 8)}}...</span>
                        <span>${{new Date(msg.received_at).toLocaleString()}}</span>
                    </div>
                </div>
            `).join('');
        }}
        
        function filterMessages() {{
            const searchTerm = document.getElementById('searchBox').value.toLowerCase();
            const filtered = allMessages.filter(msg => 
                msg.to.toLowerCase().includes(searchTerm) ||
                msg.message.toLowerCase().includes(searchTerm) ||
                msg.from_sender.toLowerCase().includes(searchTerm)
            );
            renderMessages(filtered);
        }}
        
        function updateMessagesChart() {{
            if (!messagesChart || allMessages.length === 0) return;
            
            // Group by time (last 20 data points)
            const now = Date.now();
            const timeSlots = Array(20).fill(0).map((_, i) => {{
                const time = new Date(now - (19 - i) * 60000); // Last 20 minutes
                return time.toLocaleTimeString('en-US', {{ hour: '2-digit', minute: '2-digit' }});
            }});
            
            const counts = Array(20).fill(0);
            allMessages.slice(0, 100).forEach(msg => {{
                const msgTime = new Date(msg.received_at).getTime();
                const minutesAgo = Math.floor((now - msgTime) / 60000);
                if (minutesAgo >= 0 && minutesAgo < 20) {{
                    counts[19 - minutesAgo]++;
                }}
            }});
            
            messagesChart.data.labels = timeSlots;
            messagesChart.data.datasets[0].data = counts;
            messagesChart.update();
        }}
        
        function escapeHtml(text) {{
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }}
        
        async function refresh() {{
            await Promise.all([fetchStats(), fetchMessages()]);
        }}
        
        async function clearMessages() {{
            if (confirm('Are you sure you want to clear all messages?')) {{
                try {{
                    await fetch('/api/messages', {{ method: 'DELETE' }});
                    await refresh();
                }} catch (error) {{
                    console.error('Error clearing messages:', error);
                    alert('Failed to clear messages');
                }}
            }}
        }}
        
        function setupAutoRefresh() {{
            const checkbox = document.getElementById('autoRefresh');
            
            if (checkbox.checked) {{
                autoRefreshInterval = setInterval(refresh, UPDATE_INTERVAL);
            }}
            
            checkbox.addEventListener('change', () => {{
                if (checkbox.checked) {{
                    autoRefreshInterval = setInterval(refresh, UPDATE_INTERVAL);
                }} else {{
                    clearInterval(autoRefreshInterval);
                }}
            }});
        }}
        
        // Initial load
        initCharts();
        refresh();
        setupAutoRefresh();
    </script>
</body>
</html>
"""
