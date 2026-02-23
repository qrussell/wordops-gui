import pytest
from unittest.mock import patch, MagicMock, mock_open, call
import sys
import os
import subprocess

# Ensure we can import from the current directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import provision_site_task

class TestProvisioning:

    @patch("main.WordOpsService.create_site")
    @patch("subprocess.run")
    @patch("builtins.open", new_callable=mock_open, read_data="server { listen 80; fastcgi_pass unix:/var/run/php/php81-fpm.sock; }")
    @patch("os.path.exists")
    def test_provision_site_full_flow(self, mock_exists, mock_file, mock_subprocess, mock_create_site):
        """Test the full provisioning flow with a new system user."""
        
        # Setup mocks
        mock_exists.return_value = True # Nginx config exists
        
        # Mock subprocess to simulate 'id -u' failing (user does not exist) and others succeeding
        def subprocess_side_effect(cmd, **kwargs):
            if cmd[0] == "id":
                raise subprocess.CalledProcessError(1, cmd)
            return MagicMock(returncode=0)
        
        mock_subprocess.side_effect = subprocess_side_effect

        # Define inputs
        domain = "example.com"
        php_version = "8.1"
        features = ["ssl", "cache"]
        plugins = []
        sys_user = "u_example"

        # Execute
        provision_site_task(domain, php_version, features, plugins, sys_user)

        # 1. Verify WordOps create
        mock_create_site.assert_called_once_with(domain, php_version, features)

        # 2. Verify User Creation
        # Should call useradd because 'id' failed
        mock_subprocess.assert_any_call(["useradd", "-m", "-s", "/bin/false", sys_user], check=True)

        # 3. Verify PHP Pool Creation
        pool_file_path = f"/etc/php/{php_version}/fpm/pool.d/{sys_user}.conf"
        mock_file.assert_any_call(pool_file_path, "w")
        
        # Check content written to files
        handle = mock_file()
        # Iterate over all write calls to find the pool config (mock_open reuses the handle)
        pool_config_written = False
        for call_args in handle.write.call_args_list:
            content = call_args[0][0]
            if f"[{sys_user}]" in content and f"user = {sys_user}" in content:
                pool_config_written = True
        assert pool_config_written, "PHP Pool config was not written correctly"

        # 4. Verify PHP Restart
        mock_subprocess.assert_any_call(["systemctl", "restart", f"php{php_version}-fpm"], check=True)

        # 5. Verify Nginx Patching
        nginx_conf_path = f"/etc/nginx/sites-available/{domain}"
        mock_file.assert_any_call(nginx_conf_path, "r")
        mock_file.assert_any_call(nginx_conf_path, "w")
        
        # Verify Nginx config was patched
        nginx_patched = False
        for call_args in handle.write.call_args_list:
            content = call_args[0][0]
            if f"fastcgi_pass unix:/run/php/php-fpm-{sys_user}.sock;" in content:
                nginx_patched = True
        assert nginx_patched, "Nginx config was not patched correctly"
        
        mock_subprocess.assert_any_call(["nginx", "-t"], check=True)
        mock_subprocess.assert_any_call(["systemctl", "reload", "nginx"], check=True)

        # 6. Verify Permissions
        mock_subprocess.assert_any_call(["chown", "-R", f"{sys_user}:{sys_user}", f"/var/www/{domain}"], check=True)

    @patch("main.WordOpsService.create_site")
    @patch("subprocess.run")
    @patch("builtins.open", new_callable=mock_open)
    @patch("os.path.exists")
    @patch("zipfile.ZipFile")
    def test_provision_site_with_plugins(self, mock_zip, mock_exists, mock_file, mock_subprocess, mock_create_site):
        """Test provisioning with plugin extraction."""
        
        # Setup mocks
        mock_exists.return_value = True
        mock_subprocess.return_value = MagicMock(returncode=0) # User exists, commands succeed
        
        # Mock ZipFile
        mock_zip_instance = MagicMock()
        mock_zip.return_value.__enter__.return_value = mock_zip_instance
        # Simulate a plugin zip structure
        mock_zip_instance.namelist.return_value = ["my-plugin/index.php"]

        # Inputs
        domain = "site-with-plugins.com"
        plugins = ["plugin1.zip"]
        sys_user = "u_site"

        # Execute
        provision_site_task(domain, "8.1", [], plugins, sys_user)

        # Verify Zip extraction
        vault_path = os.path.join("/opt/wordops-gui/vault", "plugin1.zip")
        mock_zip.assert_called_with(vault_path, 'r')
        
        target_dir = f"/var/www/{domain}/htdocs/wp-content/plugins"
        mock_zip_instance.extractall.assert_called_with(target_dir)

        # Verify permissions re-applied
        # chown should be called at least twice (once initial, once after plugins)
        chown_call = call(["chown", "-R", f"{sys_user}:{sys_user}", f"/var/www/{domain}"], check=True)
        assert mock_subprocess.call_args_list.count(chown_call) >= 2

    @patch("main.WordOpsService.create_site")
    @patch("subprocess.run")
    def test_provision_site_existing_user(self, mock_subprocess, mock_create_site):
        """Test that useradd is skipped if user exists."""
        
        # Mock id -u success (user exists)
        mock_subprocess.return_value = MagicMock(returncode=0)
        
        # We need to mock open/exists to avoid errors in subsequent steps
        with patch("builtins.open", mock_open(read_data="config")), \
             patch("os.path.exists", return_value=True):
            
            provision_site_task("existing.com", "8.1", [], [], "existing_user")
            
            # Verify useradd NOT called
            for call_args in mock_subprocess.call_args_list:
                args, _ = call_args
                if args[0][0] == "useradd":
                    pytest.fail("useradd should not be called if user exists")