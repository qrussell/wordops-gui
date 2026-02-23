import pytest
from unittest.mock import patch, MagicMock, mock_open
import sys
import os

# Ensure we can import from the current directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from wordops import WordOpsService

# Helper to mock subprocess.run output
def mock_run_success(stdout=""):
    return MagicMock(returncode=0, stdout=stdout, stderr="")

class TestWordOpsService:

    @patch("subprocess.run")
    def test_run_command_success(self, mock_subprocess):
        mock_subprocess.return_value = mock_run_success("success")
        result = WordOpsService.run_command(["echo", "test"])
        assert result == "success"
        mock_subprocess.assert_called_once()

    @patch("subprocess.run")
    def test_run_command_failure(self, mock_subprocess):
        # Simulate CalledProcessError
        import subprocess
        mock_subprocess.side_effect = subprocess.CalledProcessError(1, ["cmd"], stderr="error")
        
        with pytest.raises(Exception) as excinfo:
            WordOpsService.run_command(["fail"])
        assert "WordOps Error" in str(excinfo.value)

    @patch("wordops.WordOpsService.get_site_info")
    @patch("wordops.WordOpsService.run_command")
    def test_list_sites(self, mock_run, mock_info):
        mock_run.return_value = "site1.com\nsite2.com"
        mock_info.side_effect = [
            {"status": "online", "stack": {"php": "8.1"}, "ssl": {"enabled": True}, "cache": {"backend": "Redis"}},
            {"status": "offline", "stack": {"php": "8.0"}, "ssl": {"enabled": False}, "cache": {"backend": "None"}}
        ]
        
        sites = WordOpsService.list_sites()
        assert len(sites) == 2
        assert sites[0]["domain"] == "site1.com"
        assert sites[0]["status"] == "online"
        assert sites[1]["domain"] == "site2.com"
        assert sites[1]["ssl"] is False

    @patch("socket.create_connection")
    @patch("socket.gethostbyname")
    @patch("wordops.WordOpsService.run_command")
    def test_get_site_info(self, mock_run, mock_gethost, mock_socket):
        output = """
        Information about site1.com:
        Nginx configuration: .conf
        PHP Version : 8.1
        SSL : Enabled
        Type : WordPress
        Cache : Redis
        """
        mock_run.return_value = output
        mock_gethost.return_value = "127.0.0.1"
        
        # Mock SSL context and socket for SSL check
        with patch("ssl.create_default_context") as mock_ssl_ctx:
            # To test SSL expiry parsing, we need to mock OpenSSL
            with patch("OpenSSL.crypto.load_certificate") as mock_load_cert:
                mock_x509 = MagicMock()
                # Return a future date string in ASN1 format YYYYMMDDHHMMSSZ
                # 20300101...
                mock_x509.get_notAfter.return_value = b"20300101000000Z"
                mock_load_cert.return_value = mock_x509
                
                info = WordOpsService.get_site_info("site1.com")
                
                assert info["domain"] == "site1.com"
                assert info["stack"]["php"] == "8.1"
                assert info["ssl"]["enabled"] is True
                assert "days" in info["ssl"]["expires"]
                assert info["cache"]["backend"] == "Redis"

    @patch("wordops.WordOpsService.run_command")
    def test_create_site(self, mock_run):
        WordOpsService.create_site("new.com", "8.2", ["ssl", "cache"])
        mock_run.assert_called_with(["wo", "site", "create", "new.com", "--php=8.2", "-le", "--wpredis"])

    @patch("wordops.WordOpsService.run_command")
    def test_create_site_with_creds(self, mock_run):
        WordOpsService.create_site("creds.com", "8.1", [], "admin", "a@b.com", "secret")
        mock_run.assert_called_with(["wo", "site", "create", "creds.com", "--php=8.1", "--user=admin", "--email=a@b.com", "--pass=secret"])

    @patch("psutil.disk_usage")
    @patch("psutil.virtual_memory")
    @patch("psutil.cpu_percent")
    @patch("builtins.open", new_callable=mock_open, read_data="12345.67 98765.43")
    def test_get_system_stats(self, mock_file, mock_cpu, mock_mem, mock_disk):
        mock_cpu.return_value = 15.5
        
        mem = MagicMock()
        mem.used = 4 * 1024**3 # 4GB
        mem.total = 8 * 1024**3 # 8GB
        mock_mem.return_value = mem
        
        disk = MagicMock()
        disk.used = 50 * 1024**3
        disk.total = 100 * 1024**3
        mock_disk.return_value = disk
        
        stats = WordOpsService.get_system_stats()
        
        assert stats["cpu"] == 15.5
        assert stats["ram"]["used"] == 4.0
        assert stats["disk"]["total"] == 100.0
        assert "h" in stats["uptime"] # 12345 seconds is about 3.4 hours

    @patch("subprocess.check_output")
    @patch("os.path.exists")
    def test_get_logs(self, mock_exists, mock_check_output):
        mock_exists.return_value = True
        mock_check_output.return_value = b"line1\nline2"
        
        logs = WordOpsService.get_logs("site.com", "nginx-access")
        
        assert len(logs) == 2
        assert logs[0]["msg"] == "line1"

    @patch("os.listdir")
    @patch("os.path.exists")
    def test_get_php_extensions(self, mock_exists, mock_listdir):
        mock_exists.return_value = True
        # Mock mods-available and conf.d
        def listdir_side_effect(path):
            if "mods-available" in path:
                return ["curl.ini", "gd.ini", "imagick.ini"]
            if "conf.d" in path:
                return ["20-curl.ini"]
            return []
        mock_listdir.side_effect = listdir_side_effect
        
        exts = WordOpsService.get_php_extensions("8.1")
        
        assert len(exts) == 3
        # curl should be enabled
        curl = next(e for e in exts if e["name"] == "curl")
        assert curl["status"] is True
        # gd should be disabled
        gd = next(e for e in exts if e["name"] == "gd")
        assert gd["status"] is False

    @patch("wordops.WordOpsService.run_command")
    def test_manage_php_extension(self, mock_run):
        WordOpsService.manage_php_extension("8.1", "gd", "enable")
        # Should call phpenmod and systemctl restart
        assert mock_run.call_count == 2
        mock_run.assert_any_call(["sudo", "phpenmod", "-v", "8.1", "gd"])

    @patch("subprocess.run")
    def test_get_services(self, mock_run):
        def side_effect(cmd, **kwargs):
            res = MagicMock()
            res.returncode = 0
            res.stdout = ""
            res.stderr = ""
            
            # Mock systemctl calls
            if cmd[0] == "systemctl" and cmd[1] == "is-active":
                service = cmd[2]
                if service in ["nginx", "php8.1-fpm"]:
                    res.returncode = 0
                    res.stdout = "active\n"
                else:
                    res.returncode = 3
                    res.stdout = "inactive\n"
            # Mock version checks
            elif cmd[0] == "nginx" and cmd[1] == "-v":
                res.stderr = "nginx version: nginx/1.18.0\n"
            elif "php" in cmd[0] and cmd[1] == "-v":
                res.stdout = "PHP 8.1.2 (cli) (built: ...)\n"
            
            return res
            
        mock_run.side_effect = side_effect
        
        services = WordOpsService.get_services()
        
        # Verify NGINX detection
        nginx = next((s for s in services if s["service"] == "nginx"), None)
        assert nginx is not None
        assert nginx["status"] == "running"
        assert "1.18.0" in nginx["version"]
        
        # Verify PHP detection
        php = next((s for s in services if s["service"] == "php8.1-fpm"), None)
        assert php is not None
        assert php["status"] == "running"
        assert "8.1.2" in php["version"]

if __name__ == "__main__":
    pytest.main([__file__])