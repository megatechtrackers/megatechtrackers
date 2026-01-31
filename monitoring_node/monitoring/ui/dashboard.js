
        const UPDATE_INTERVAL = __UPDATE_INTERVAL__;
        const MAX_HISTORY = 30;
        
        let cpuChart, memoryChart, nodeCpuChart, nodeMemoryChart;
        let nodesData = {};
        let nodeHistory = {};
        let selectedNode = null;
        
        function initCharts() {
            const chartConfig = (label, color) => ({
                type: 'line',
                data: { labels: [], datasets: [] },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    resizeDelay: 100,
                    animation: { duration: 0 },
                    plugins: {
                        legend: { 
                            display: true, 
                            position: 'top', 
                            labels: { 
                                usePointStyle: true, 
                                boxWidth: 6, 
                                font: { size: window.innerWidth < 768 ? 8 : 10 },
                                padding: window.innerWidth < 768 ? 8 : 12
                            } 
                        },
                        tooltip: { mode: 'index', intersect: false }
                    },
                    scales: {
                        x: { 
                            display: true, 
                            grid: { display: false }, 
                            ticks: { 
                                maxTicksLimit: window.innerWidth < 768 ? 4 : 6, 
                                font: { size: window.innerWidth < 768 ? 8 : 9 } 
                            } 
                        },
                        y: { 
                            beginAtZero: true, 
                            max: 100, 
                            grid: { color: 'rgba(0,0,0,0.05)' }, 
                            ticks: { 
                                callback: v => v + '%', 
                                font: { size: window.innerWidth < 768 ? 8 : 9 },
                                maxTicksLimit: 5
                            } 
                        }
                    },
                    interaction: { mode: 'nearest', axis: 'x', intersect: false },
                    layout: {
                        padding: { top: 5, bottom: 5, left: 0, right: 5 }
                    }
                }
            });
            
            cpuChart = new Chart(document.getElementById('cpu-chart'), chartConfig('CPU', '#3b82f6'));
            memoryChart = new Chart(document.getElementById('memory-chart'), chartConfig('Memory', '#22c55e'));
            nodeCpuChart = new Chart(document.getElementById('node-cpu-chart'), chartConfig('CPU', '#3b82f6'));
            nodeMemoryChart = new Chart(document.getElementById('node-memory-chart'), chartConfig('Memory', '#22c55e'));
        }
        
        // Debounced resize handler for charts
        let resizeTimeout;
        function handleResize() {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (cpuChart) cpuChart.resize();
                if (memoryChart) memoryChart.resize();
                if (nodeCpuChart) nodeCpuChart.resize();
                if (nodeMemoryChart) nodeMemoryChart.resize();
            }, 150);
        }
        
        function updateNodeList() {
            fetch('/api/parser-nodes/status')
                .then(r => r.json())
                .then(data => {
                    const nodes = data.parser_nodes || [];
                    const container = document.getElementById('node-list');
                    document.getElementById('nodes-count').textContent = nodes.length;
                    
                    // Calculate totals
                    let totalTrackers = 0;
                    nodes.forEach(n => {
                        totalTrackers += n.load?.active_connections || 0;
                        nodesData[n.node_id] = n;
                        
                        // Track history
                        if (!nodeHistory[n.node_id]) nodeHistory[n.node_id] = [];
                        nodeHistory[n.node_id].push({
                            time: new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'}),
                            cpu: n.load?.cpu_usage || 0,
                            memory: n.load?.memory_usage_percent || 0
                        });
                        if (nodeHistory[n.node_id].length > MAX_HISTORY) {
                            nodeHistory[n.node_id] = nodeHistory[n.node_id].slice(-MAX_HISTORY);
                        }
                    });
                    
                    document.getElementById('trackers-count').textContent = totalTrackers;
                    
                    if (nodes.length === 0) {
                        container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No nodes reporting</div>';
                        return;
                    }
                    
                    let html = '';
                    nodes.forEach(node => {
                        const load = node.load || {};
                        const isSelected = selectedNode === node.node_id;
                        html += `
                            <div class="node-item${isSelected ? ' selected' : ''}" onclick="selectNodeMobile('${node.node_id}')">
                                <div class="node-item-header">
                                    <span class="node-name">${node.node_id}</span>
                                    <span class="node-badge ${node.status}">${node.status}</span>
                                </div>
                                <div class="node-meta">
                                    <span>${load.active_connections || 0} trackers</span>
                                    <span>CPU ${(load.cpu_usage || 0).toFixed(0)}%</span>
                                    <span>Mem ${(load.memory_usage_percent || 0).toFixed(0)}%</span>
                                </div>
                            </div>
                        `;
                    });
                    container.innerHTML = html;
                    
                    // Update charts
                    updateOverviewCharts(nodes);
                    if (selectedNode && nodesData[selectedNode]) {
                        updateNodeDetailCharts(selectedNode);
                    }
                })
                .catch(e => console.error('Error:', e));
        }
        
        function updateOverviewCharts(nodes) {
            const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
            const time = new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
            
            // Build datasets from all nodes
            const cpuDatasets = [];
            const memDatasets = [];
            
            nodes.forEach((node, i) => {
                const history = nodeHistory[node.node_id] || [];
                const color = colors[i % colors.length];
                
                cpuDatasets.push({
                    label: node.node_id.replace(/-parser-/g, '-P').replace(/^[a-z]+-/, ''),
                    data: history.map(h => h.cpu),
                    borderColor: color,
                    backgroundColor: color + '20',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 0
                });
                
                memDatasets.push({
                    label: node.node_id.replace(/-parser-/g, '-P').replace(/^[a-z]+-/, ''),
                    data: history.map(h => h.memory),
                    borderColor: color,
                    backgroundColor: color + '20',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 0
                });
            });
            
            const labels = (nodeHistory[nodes[0]?.node_id] || []).map(h => h.time);
            
            cpuChart.data.labels = labels;
            cpuChart.data.datasets = cpuDatasets;
            cpuChart.update('none');
            
            memoryChart.data.labels = labels;
            memoryChart.data.datasets = memDatasets;
            memoryChart.update('none');
        }
        
        function updateNodeDetailCharts(nodeId) {
            const history = nodeHistory[nodeId] || [];
            const labels = history.map(h => h.time);
            
            nodeCpuChart.data.labels = labels;
            nodeCpuChart.data.datasets = [{
                label: 'CPU %',
                data: history.map(h => h.cpu),
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59,130,246,0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointRadius: 0
            }];
            nodeCpuChart.update('none');
            
            nodeMemoryChart.data.labels = labels;
            nodeMemoryChart.data.datasets = [{
                label: 'Memory %',
                data: history.map(h => h.memory),
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34,197,94,0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointRadius: 0
            }];
            nodeMemoryChart.update('none');
        }
        
        function updateDashboard() {
            fetch('/status')
                .then(r => r.json())
                .then(data => {
                    // Status
                    const hasAlerts = (data.alerts || []).length > 0;
                    const health = data.server?.status === 'running' ? (hasAlerts ? 'degraded' : 'healthy') : 'unhealthy';
                    document.getElementById('status-dot').className = 'status-dot ' + health;
                    document.getElementById('status-text').textContent = health.charAt(0).toUpperCase() + health.slice(1);
                    
                    // Uptime
                    const uptime = data.server?.uptime_seconds || 0;
                    document.getElementById('uptime').textContent = formatUptime(uptime);
                    
                    // Connection stats
                    const conn = data.connections || {};
                    document.getElementById('stat-trackers').textContent = conn.active || 0;
                    document.getElementById('stat-attempts').textContent = conn.total_connected || 0;
                    document.getElementById('stat-rejected').textContent = conn.total_rejected || 0;
                    document.getElementById('stat-capacity').textContent = formatNumber(conn.max_allowed || 0);
                    
                    // Alerts
                    const alerts = data.alerts || [];
                    let alertsHtml = '';
                    if (alerts.length === 0) {
                        alertsHtml = `<div class="alert-ok">
                            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
                            </svg>
                            All systems operational
                        </div>`;
                    } else {
                        alerts.forEach(alert => {
                            alertsHtml += `<div class="alert ${alert.level}">${alert.message}</div>`;
                        });
                    }
                    document.getElementById('alerts-container').innerHTML = alertsHtml;
                })
                .catch(e => console.error('Error:', e));
        }
        
        function selectNode(nodeId) {
            selectedNode = nodeId;
            const node = nodesData[nodeId];
            if (!node) return;
            
            // Update sidebar selection
            document.querySelectorAll('.node-item').forEach(el => {
                el.classList.remove('selected');
                if (el.textContent.includes(nodeId)) el.classList.add('selected');
            });
            
            // Show detail view
            document.getElementById('overview-view').style.display = 'none';
            document.getElementById('node-detail-view').classList.add('active');
            
            // Update header
            document.getElementById('view-title').textContent = nodeId;
            document.getElementById('detail-node-name').textContent = nodeId;
            document.getElementById('detail-node-status').textContent = node.status;
            document.getElementById('detail-node-status').className = 'detail-badge ' + node.status;
            
            // Update stats
            const load = node.load || {};
            document.getElementById('detail-stats').innerHTML = `
                <div class="detail-stat">
                    <div class="detail-stat-label">Active Trackers</div>
                    <div class="detail-stat-value">${load.active_connections || 0}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Capacity</div>
                    <div class="detail-stat-value">${formatNumber(load.max_connections || 0)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">CPU Usage</div>
                    <div class="detail-stat-value">${(load.cpu_usage || 0).toFixed(1)}%</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Memory</div>
                    <div class="detail-stat-value">${(load.memory_usage_percent || 0).toFixed(1)}%</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Messages/sec</div>
                    <div class="detail-stat-value">${(load.messages_per_second || 0).toFixed(1)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Success Rate</div>
                    <div class="detail-stat-value">${(load.publish_success_rate || 100).toFixed(1)}%</div>
                </div>
            `;
            
            updateNodeDetailCharts(nodeId);
        }
        
        function showOverview() {
            selectedNode = null;
            document.getElementById('overview-view').style.display = 'block';
            document.getElementById('node-detail-view').classList.remove('active');
            document.getElementById('view-title').textContent = 'Fleet Overview';
            document.querySelectorAll('.node-item').forEach(el => el.classList.remove('selected'));
        }
        
        function formatUptime(seconds) {
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            if (days > 0) return days + 'd ' + hours + 'h';
            if (hours > 0) return hours + 'h ' + minutes + 'm';
            return minutes + 'm';
        }
        
        function formatNumber(num) {
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
            return num.toString();
        }
        
        // Mobile sidebar functions
        function toggleSidebar() {
            document.getElementById('sidebar').classList.toggle('open');
            document.getElementById('sidebar-overlay').classList.toggle('open');
        }
        
        function closeSidebar() {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('sidebar-overlay').classList.remove('open');
        }
        
        // Close sidebar when selecting a node on mobile
        function selectNodeMobile(nodeId) {
            selectNode(nodeId);
            // Close sidebar on mobile/tablet
            if (window.innerWidth <= 768) {
                closeSidebar();
            }
        }
        
        // Handle window resize - close sidebar if resizing to desktop and resize charts
        window.addEventListener('resize', function() {
            if (window.innerWidth > 768) {
                closeSidebar();
            }
            handleResize();
        });
        
        // Also handle orientation change on mobile
        window.addEventListener('orientationchange', function() {
            setTimeout(handleResize, 200);
        });
        
        // Initialize
        initCharts();
        updateDashboard();
        updateNodeList();
        setInterval(() => {
            updateDashboard();
            updateNodeList();
        }, UPDATE_INTERVAL);
    