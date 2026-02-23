import subprocess
import psutil
import re
import os
import socket
import ssl
from datetime import datetime
import OpenSSL
from typing import List, Dict, Optional

class WordOpsService:
    """
    Service layer for interacting with WordOps CLI and System Resources.
    """

    @staticmethod
    def run_command(command: List[str]) -> str:
        """Helper to run shell commands safely"""
        try:
            # shell=False is safer and default for list args
            result = subprocess.run(
                command, 
                capture_output=True, 
                text=True, 
                check=True
            )
            return result.stdout.strip()
        except subprocess.CalledProcessError as e:
            print(f"Command failed: {e.cmd}. Error: {e.stderr}")
            # Re-raise with stderr for better API error messages
            raise Exception(f"WordOps Error: {e.stderr.strip()}")
        except FileNotFoundError:
            print(f"Command not found: {command[0]}")
            raise Exception(f"Command not found: {command[0]}")

    @staticmethod
    def list_sites() -> List[Dict]:
        """Parses `wo site list` to return a list of sites."""
        try:
            raw_output = WordOpsService.run_command(["wo", "site", "list"])
            if not raw_output:
                return []
            domains = raw_output.splitlines()
            
            sites = []
            for idx, domain in enumerate(domains):
                if not domain: continue
                # Note: Calling get_site_info for every site is slow (N+1).
                # In a real app, we might want to cache this or return a lighter list
                # and fetch details on demand.
                details = WordOpsService.get_site_info(domain)
                sites.append({
                    "id": idx + 1,
                    "domain": domain,
                    "status": details.get("status", "offline"),
                    "php": details.get("stack", {}).get("php", "N/A"),
                    "ssl": details.get("ssl", {}).get("enabled", False),
                    "cache": details.get("cache", {}).get("backend", "N/A"),
                    "db": True 
                })
            return sites
        except Exception as e:
            print(f"Error listing sites: {e}")
            return []

    @staticmethod
    def get_site_info(domain: str) -> Dict:
        """
        Parses `wo site info <domain>` to return detailed JSON.
        """
        try:
            output = WordOpsService.run_command(["wo", "site", "info", domain])
            
            # --- Parsers ---
            def search(pattern, text, default=""):
                match = re.search(pattern, text)
                return match.group(1).strip() if match else default

            php_version = search(r"PHP Version\s+:\s+(.*)", output, "N/A")
            ssl_info = search(r"SSL\s+:\s+(.*)", output, "Disabled")
            site_type = search(r"Type\s+:\s+(.*)", output, "WordPress")
            cache_type_raw = search(r"Cache\s+:\s+(.*)", output, "None")
            
            # --- IP & Status ---
            ip_address = "N/A"
            status = "offline"
            try:
                # Basic check if site resolves and port 80 is open
                ip_address = socket.gethostbyname(domain)
                with socket.create_connection((ip_address, 80), timeout=1):
                    status = "online"
            except Exception:
                pass
            
            # --- SSL Details ---
            ssl_enabled = "Enabled" in ssl_info
            ssl_expires = "N/A"
            if ssl_enabled:
                try:
                    # Try to fetch cert info
                    ctx = ssl.create_default_context()
                    ctx.check_hostname = False
                    ctx.verify_mode = ssl.CERT_NONE
                    with socket.create_connection((domain, 443), timeout=2) as sock:
                        with ctx.wrap_socket(sock, server_hostname=domain) as ssock:
                            cert_bin = ssock.getpeercert(binary_form=True)
                            x509 = OpenSSL.crypto.load_certificate(OpenSSL.crypto.FILETYPE_ASN1, cert_bin)
                            not_after = x509.get_notAfter().decode('utf-8')
                            # ASN1 time format: YYYYMMDDHHMMSSZ
                            expiry_date = datetime.strptime(not_after, '%Y%m%d%H%M%SZ')
                            days_left = (expiry_date - datetime.utcnow()).days
                            ssl_expires = f"{days_left} days"
                except Exception as e:
                    print(f"SSL Check failed for {domain}: {e}")
                    ssl_expires = "Unknown"
            
            # --- Cache Detection ---
            cache_backend = "None"
            if "Redis" in cache_type_raw:
                cache_backend = "Redis"
            elif "FastCGI" in cache_type_raw:
                cache_backend = "FastCGI"
            elif "WpSuperCache" in cache_type_raw:
                cache_backend = "WP Super Cache"
            
            return {
                "domain": domain,
                "status": status,
                "ip": ip_address,
                "user": "www-data",
                "root": f"/var/www/{domain}/htdocs",
                "ssl": {
                    "enabled": ssl_enabled,
                    "provider": "Let's Encrypt" if "Let's Encrypt" in ssl_info else "Self-signed",
                    "expires": ssl_expires,
                    "forceHttps": True 
                },
                "stack": {
                    "type": site_type,
                    "php": php_version,
                    "server": "NGINX"
                },
                "cache": {
                    "backend": cache_backend,
                    "status": "enabled" if cache_backend != "None" else "disabled"
                },
                "db": {
                    "name": f"wo_{domain.replace('.', '_')}",
                    "user": "wo_user",
                    "host": "localhost"
                }
            }
        except Exception as e:
            # Return minimal info on failure
            return {
                "domain": domain, 
                "status": "error", 
                "error_message": str(e),
                "ip": "N/A", "user": "N/A", "root": "N/A", "ssl": {}, "stack": {}, "cache": {}, "db": {}
            }

    @staticmethod
    def create_site(domain: str, php: str, features: List[str]):
        """Constructs and runs the `wo site create` command."""
        cmd = ["wo", "site", "create", domain, f"--php={php}"]
        
        if "ssl" in features:
            cmd.append("-le")
        if "cache" in features:
            cmd.append("--wpredis")
        
        WordOpsService.run_command(cmd)
        return True

    @staticmethod
    def get_system_stats() -> Dict:
        """Uses psutil to get real-time server metrics."""
        try:
            with open('/proc/uptime', 'r') as f:
                uptime_seconds = float(f.readline().split()[0])
                days = int(uptime_seconds // (24 * 3600))
                hours = int((uptime_seconds % (24 * 3600)) // 3600)
                minutes = int((uptime_seconds % 3600) // 60)
                uptime_str = f"{days}d {hours}h {minutes}m"
        except Exception:
            uptime_str = "N/A"

        return {
            "cpu": psutil.cpu_percent(interval=0.1),
            "ram": {
                "used": round(psutil.virtual_memory().used / (1024**3), 2),
                "total": round(psutil.virtual_memory().total / (1024**3), 2)
            },
            "disk": {
                "used": round(psutil.disk_usage('/').used / (1024**3), 2),
                "total": round(psutil.disk_usage('/').total / (1024**3), 2)
            },
            "uptime": uptime_str
        }

    @staticmethod
    def get_logs(domain: str, log_type: str) -> List[Dict]:
        """Reads the last 50 lines of the requested log file."""
        log_map = {
            "nginx-access": f"/var/log/nginx/{domain}.access.log",
            "nginx-error": f"/var/log/nginx/{domain}.error.log",
            "audit": "/var/log/wo/wordops.log"
        }
        
        file_path = log_map.get(log_type)
        if not file_path or not os.path.exists(file_path):
            return [{"time": "System", "msg": f"Log file not found: {file_path}", "color": "text-red-500"}]

        try:
            # Using tail command 
            output = subprocess.check_output(["tail", "-n", "50", file_path]).decode("utf-8", errors="replace")
            
            parsed_logs = []
            for line in output.splitlines():
                parsed_logs.append({
                    "time": "", 
                    "msg": line,
                    "color": "text-gray-300"
                })
            return parsed_logs
        except Exception as e:
            return [{"time": "Error", "msg": str(e), "color": "text-red-500"}]

    @staticmethod
    def get_php_extensions(version: str = "8.1") -> List[Dict]:
        """Get list of PHP extensions and their status."""
        try:
            mods_available = f"/etc/php/{version}/mods-available"
            mods_enabled = f"/etc/php/{version}/fpm/conf.d"
            
            if not os.path.exists(mods_available):
                return []

            extensions = []
            enabled_files = os.listdir(mods_enabled) if os.path.exists(mods_enabled) else []

            for filename in os.listdir(mods_available):
                if filename.endswith(".ini"):
                    name = filename[:-4]
                    status = False
                    for ef in enabled_files:
                        if ef.endswith(filename):
                            status = True
                            break
                    extensions.append({"name": name, "status": status, "desc": f"PHP {version} Extension"})
            
            return sorted(extensions, key=lambda x: x['name'])
        except Exception as e:
            print(f"Error fetching PHP extensions: {e}")
            return []

    @staticmethod
    def manage_php_extension(version: str, extension: str, action: str):
        """Enable or disable a PHP extension and restart FPM."""
        cmd = "phpenmod" if action == "enable" else "phpdismod"
        WordOpsService.run_command(["sudo", cmd, "-v", version, extension])
        WordOpsService.run_command(["sudo", "systemctl", "restart", f"php{version}-fpm"])
        return True

    @staticmethod
    def get_services() -> List[Dict]:
        """Get status of system services."""
        services_to_check = [
            ("NGINX", "nginx"),
            ("MariaDB", "mariadb"),
            ("Redis", "redis-server"),
            ("PHP 8.0-FPM", "php8.0-fpm"),
            ("PHP 8.1-FPM", "php8.1-fpm"),
            ("PHP 8.2-FPM", "php8.2-fpm"),
            ("PHP 8.3-FPM", "php8.3-fpm"),
            ("UFW", "ufw")
        ]
        
        results = []
        for name, service_name in services_to_check:
            try:
                # Check if service exists/is loaded
                status_check = subprocess.run(
                    ["systemctl", "is-active", service_name],
                    capture_output=True,
                    text=True
                )
                
                # Filter out services that are not installed
                if "unknown" in status_check.stdout.strip():
                    continue
                    
                is_running = status_check.returncode == 0
                status = "running" if is_running else "stopped"
                
                # Try to get version
                version = "Unknown"
                if "nginx" in service_name:
                    v = subprocess.run(["nginx", "-v"], capture_output=True, text=True)
                    out = v.stderr + v.stdout
                    m = re.search(r"nginx/([\d\.]+)", out)
                    if m: version = m.group(1)
                elif "php" in service_name:
                    php_bin = service_name.split("-")[0] 
                    v = subprocess.run([php_bin, "-v"], capture_output=True, text=True)
                    m = re.search(r"PHP ([\d\.]+)", v.stdout)
                    if m: version = m.group(1)
                elif "mariadb" in service_name:
                    v = subprocess.run(["mariadb", "--version"], capture_output=True, text=True)
                    m = re.search(r"Distrib ([\d\.]+)", v.stdout)
                    if m: version = m.group(1)
                elif "redis" in service_name:
                    v = subprocess.run(["redis-server", "--version"], capture_output=True, text=True)
                    m = re.search(r"v=([\d\.]+)", v.stdout)
                    if m: version = m.group(1)
                
                results.append({
                    "name": name,
                    "service": service_name,
                    "status": status,
                    "version": version,
                    "uptime": "Active" if is_running else "Inactive"
                })
            except Exception:
                pass
                
        return results