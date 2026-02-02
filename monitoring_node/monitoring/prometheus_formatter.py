"""
Prometheus metrics formatter
"""
from typing import Dict, Any, List


def format_prometheus_metrics(metrics: Dict[str, Any], parser_node_metrics: Dict[str, Dict] = None) -> str:
    """
    Format metrics as Prometheus text format.
    
    Args:
        metrics: Dictionary containing all metrics
        parser_node_metrics: Dictionary of per-node metrics (optional)
        
    Returns:
        Prometheus-formatted metrics string
    """
    lines = []
    
    # =====================
    # Fleet-level metrics (aggregated from all parser services)
    # =====================
    
    # Connections
    connections = metrics.get("connections", {})
    lines.append("# HELP fleet_trackers_online Currently connected trackers across all parser services")
    lines.append("# TYPE fleet_trackers_online gauge")
    lines.append(f"fleet_trackers_online {connections.get('active', 0)}")
    
    lines.append("# HELP fleet_connection_attempts Total connection attempts since startup")
    lines.append("# TYPE fleet_connection_attempts counter")
    lines.append(f"fleet_connection_attempts {connections.get('total_connected', 0)}")
    
    lines.append("# HELP fleet_connections_rejected Total rejected connections")
    lines.append("# TYPE fleet_connections_rejected counter")
    lines.append(f"fleet_connections_rejected {connections.get('total_rejected', 0)}")
    
    lines.append("# HELP fleet_connections_capacity Total connection capacity across all services")
    lines.append("# TYPE fleet_connections_capacity gauge")
    lines.append(f"fleet_connections_capacity {connections.get('max_allowed', 0)}")
    
    # Parser services count
    parser_nodes = metrics.get("parser_nodes", {})
    lines.append("# HELP fleet_parser_services_total Total number of parser services reporting")
    lines.append("# TYPE fleet_parser_services_total gauge")
    lines.append(f"fleet_parser_services_total {parser_nodes.get('count', 0)}")
    
    # Processing metrics (aggregate)
    processing = metrics.get("processing", {})
    lines.append("# HELP fleet_packets_processed Total packets processed across all services")
    lines.append("# TYPE fleet_packets_processed counter")
    lines.append(f"fleet_packets_processed {processing.get('packets_parsed', 0)}")
    
    lines.append("# HELP fleet_records_saved Total records saved")
    lines.append("# TYPE fleet_records_saved counter")
    lines.append(f"fleet_records_saved {processing.get('records_saved', 0)}")
    
    lines.append("# HELP fleet_errors_total Total processing errors")
    lines.append("# TYPE fleet_errors_total counter")
    lines.append(f"fleet_errors_total {processing.get('errors', 0)}")
    
    lines.append("# HELP fleet_messages_total Total messages processed")
    lines.append("# TYPE fleet_messages_total counter")
    lines.append(f"fleet_messages_total {processing.get('total_messages', 0)}")
    
    # Queue metrics (aggregate)
    queues = metrics.get("queues", {})
    lines.append("# HELP fleet_messages_per_second Aggregate message throughput")
    lines.append("# TYPE fleet_messages_per_second gauge")
    lines.append(f"fleet_messages_per_second {queues.get('messages_per_second', 0)}")
    
    # =====================
    # Monitoring Server metrics (host running the monitoring service)
    # =====================
    
    system = metrics.get("system", {})
    lines.append("# HELP monitoring_server_cpu_percent Monitoring server CPU usage")
    lines.append("# TYPE monitoring_server_cpu_percent gauge")
    lines.append(f"monitoring_server_cpu_percent {system.get('cpu_percent', 0)}")
    
    lines.append("# HELP monitoring_server_memory_percent Monitoring server memory usage")
    lines.append("# TYPE monitoring_server_memory_percent gauge")
    lines.append(f"monitoring_server_memory_percent {system.get('memory_percent', 0)}")
    
    lines.append("# HELP monitoring_server_memory_bytes Monitoring server memory used in bytes")
    lines.append("# TYPE monitoring_server_memory_bytes gauge")
    lines.append(f"monitoring_server_memory_bytes {int(system.get('memory_used_mb', 0) * 1024 * 1024)}")
    
    lines.append("# HELP monitoring_server_disk_percent Monitoring server disk usage")
    lines.append("# TYPE monitoring_server_disk_percent gauge")
    lines.append(f"monitoring_server_disk_percent {system.get('disk_usage_percent', 0)}")
    
    # Server uptime
    server = metrics.get("server", {})
    lines.append("# HELP monitoring_server_uptime_seconds Monitoring server uptime")
    lines.append("# TYPE monitoring_server_uptime_seconds gauge")
    lines.append(f"monitoring_server_uptime_seconds {server.get('uptime_seconds', 0)}")
    
    # =====================
    # Per-parser-service metrics (for detailed monitoring)
    # =====================

    if parser_node_metrics:
        # Trackers per parser service
        lines.append("# HELP parser_service_trackers_online Currently connected trackers per parser service")
        lines.append("# TYPE parser_service_trackers_online gauge")
        for node_id, node_metrics in parser_node_metrics.items():
            vendor = node_metrics.get('vendor', 'unknown')
            active = node_metrics.get('active_connections', 0)
            lines.append(f'parser_service_trackers_online{{node="{node_id}",vendor="{vendor}"}} {active}')

        # Connection attempts per parser service
        lines.append("# HELP parser_service_connection_attempts Total connection attempts per parser service")
        lines.append("# TYPE parser_service_connection_attempts counter")
        for node_id, node_metrics in parser_node_metrics.items():
            vendor = node_metrics.get('vendor', 'unknown')
            total = node_metrics.get('total_connections', 0)
            lines.append(f'parser_service_connection_attempts{{node="{node_id}",vendor="{vendor}"}} {total}')

        # Rejected per parser service
        lines.append("# HELP parser_service_connections_rejected Rejected connections per parser service")
        lines.append("# TYPE parser_service_connections_rejected counter")
        for node_id, node_metrics in parser_node_metrics.items():
            vendor = node_metrics.get('vendor', 'unknown')
            rejected = node_metrics.get('total_rejected', 0)
            lines.append(f'parser_service_connections_rejected{{node="{node_id}",vendor="{vendor}"}} {rejected}')

        # Capacity per parser service
        lines.append("# HELP parser_service_capacity Max connections per parser service")
        lines.append("# TYPE parser_service_capacity gauge")
        for node_id, node_metrics in parser_node_metrics.items():
            vendor = node_metrics.get('vendor', 'unknown')
            capacity = node_metrics.get('max_connections', 5000)
            lines.append(f'parser_service_capacity{{node="{node_id}",vendor="{vendor}"}} {capacity}')

        # CPU per parser service
        lines.append("# HELP parser_service_cpu_percent CPU usage per parser service")
        lines.append("# TYPE parser_service_cpu_percent gauge")
        for node_id, node_metrics in parser_node_metrics.items():
            vendor = node_metrics.get('vendor', 'unknown')
            cpu = node_metrics.get('cpu_usage', 0)
            lines.append(f'parser_service_cpu_percent{{node="{node_id}",vendor="{vendor}"}} {cpu}')

        # Memory percent per parser service
        lines.append("# HELP parser_service_memory_percent Memory usage percent per parser service")
        lines.append("# TYPE parser_service_memory_percent gauge")
        for node_id, node_metrics in parser_node_metrics.items():
            vendor = node_metrics.get('vendor', 'unknown')
            mem_pct = node_metrics.get('memory_usage_percent', 0)
            lines.append(f'parser_service_memory_percent{{node="{node_id}",vendor="{vendor}"}} {mem_pct}')

        # Memory MB per parser service
        lines.append("# HELP parser_service_memory_mb Memory used in MB per parser service")
        lines.append("# TYPE parser_service_memory_mb gauge")
        for node_id, node_metrics in parser_node_metrics.items():
            vendor = node_metrics.get('vendor', 'unknown')
            mem_mb = node_metrics.get('memory_usage_mb', 0)
            lines.append(f'parser_service_memory_mb{{node="{node_id}",vendor="{vendor}"}} {mem_mb}')

        # Messages per second per parser service
        lines.append("# HELP parser_service_messages_per_second Message throughput per parser service")
        lines.append("# TYPE parser_service_messages_per_second gauge")
        for node_id, node_metrics in parser_node_metrics.items():
            vendor = node_metrics.get('vendor', 'unknown')
            mps = node_metrics.get('messages_per_second', 0)
            lines.append(f'parser_service_messages_per_second{{node="{node_id}",vendor="{vendor}"}} {mps}')

        # Publish success rate per parser service
        lines.append("# HELP parser_service_publish_success_rate RabbitMQ publish success rate per parser service")
        lines.append("# TYPE parser_service_publish_success_rate gauge")
        for node_id, node_metrics in parser_node_metrics.items():
            vendor = node_metrics.get('vendor', 'unknown')
            rate = node_metrics.get('publish_success_rate', 100)
            lines.append(f'parser_service_publish_success_rate{{node="{node_id}",vendor="{vendor}"}} {rate}')

        # Error rate per parser service
        lines.append("# HELP parser_service_error_rate Error rate per parser service")
        lines.append("# TYPE parser_service_error_rate gauge")
        for node_id, node_metrics in parser_node_metrics.items():
            vendor = node_metrics.get('vendor', 'unknown')
            err_rate = node_metrics.get('error_rate', 0)
            lines.append(f'parser_service_error_rate{{node="{node_id}",vendor="{vendor}"}} {err_rate}')
        
        # =====================
        # Camera-specific metrics (for camera vendor nodes)
        # =====================
        
        camera_nodes = {k: v for k, v in parser_node_metrics.items() if v.get('vendor') == 'camera'}
        
        if camera_nodes:
            # CMS servers healthy
            lines.append("# HELP camera_cms_servers_healthy Number of healthy CMS servers")
            lines.append("# TYPE camera_cms_servers_healthy gauge")
            for node_id, node_metrics in camera_nodes.items():
                healthy = node_metrics.get('cms_servers_healthy', 0)
                lines.append(f'camera_cms_servers_healthy{{node="{node_id}"}} {healthy}')
            
            # CMS servers unhealthy
            lines.append("# HELP camera_cms_servers_unhealthy Number of unhealthy CMS servers")
            lines.append("# TYPE camera_cms_servers_unhealthy gauge")
            for node_id, node_metrics in camera_nodes.items():
                unhealthy = node_metrics.get('cms_servers_unhealthy', 0)
                lines.append(f'camera_cms_servers_unhealthy{{node="{node_id}"}} {unhealthy}')
            
            # Circuit breaker trips
            lines.append("# HELP camera_circuit_breaker_trips Total circuit breaker trips")
            lines.append("# TYPE camera_circuit_breaker_trips counter")
            for node_id, node_metrics in camera_nodes.items():
                trips = node_metrics.get('circuit_breaker_trips', 0)
                lines.append(f'camera_circuit_breaker_trips{{node="{node_id}"}} {trips}')
            
            # Devices polled
            lines.append("# HELP camera_devices_polled Total devices polled")
            lines.append("# TYPE camera_devices_polled counter")
            for node_id, node_metrics in camera_nodes.items():
                devices = node_metrics.get('devices_polled', 0)
                lines.append(f'camera_devices_polled{{node="{node_id}"}} {devices}')
            
            # Events published
            lines.append("# HELP camera_events_published Total events/violations published")
            lines.append("# TYPE camera_events_published counter")
            for node_id, node_metrics in camera_nodes.items():
                events = node_metrics.get('events_published', 0)
                lines.append(f'camera_events_published{{node="{node_id}"}} {events}')
            
            # Trackdata published
            lines.append("# HELP camera_trackdata_published Total trackdata records published")
            lines.append("# TYPE camera_trackdata_published counter")
            for node_id, node_metrics in camera_nodes.items():
                trackdata = node_metrics.get('trackdata_published', 0)
                lines.append(f'camera_trackdata_published{{node="{node_id}"}} {trackdata}')
            
            # Deduplication hits
            lines.append("# HELP camera_dedup_hits Total deduplication cache hits")
            lines.append("# TYPE camera_dedup_hits counter")
            for node_id, node_metrics in camera_nodes.items():
                hits = node_metrics.get('dedup_hits', 0)
                lines.append(f'camera_dedup_hits{{node="{node_id}"}} {hits}')
            
            # Deduplication cache size
            lines.append("# HELP camera_dedup_cache_size Current deduplication cache size")
            lines.append("# TYPE camera_dedup_cache_size gauge")
            for node_id, node_metrics in camera_nodes.items():
                size = node_metrics.get('dedup_cache_size', 0)
                lines.append(f'camera_dedup_cache_size{{node="{node_id}"}} {size}')
            
            # Poll cycles
            lines.append("# HELP camera_poll_cycles Total polling cycles completed")
            lines.append("# TYPE camera_poll_cycles counter")
            for node_id, node_metrics in camera_nodes.items():
                cycles = node_metrics.get('poll_cycles', 0)
                lines.append(f'camera_poll_cycles{{node="{node_id}"}} {cycles}')
            
            # API errors
            lines.append("# HELP camera_api_errors Total CMS API errors")
            lines.append("# TYPE camera_api_errors counter")
            for node_id, node_metrics in camera_nodes.items():
                api_errors = node_metrics.get('api_errors', 0)
                lines.append(f'camera_api_errors{{node="{node_id}"}} {api_errors}')
    
    return "\n".join(lines) + "\n"
