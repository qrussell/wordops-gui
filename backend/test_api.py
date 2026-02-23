import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, mock_open
import sys
import os
import asyncio
import pyotp
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure we can import from the current directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from main import app, get_current_user, User, get_db, Base
except ImportError:
    # Mock for generation if main.py dependencies aren't available in this context
    from fastapi import FastAPI
    app = FastAPI()
    get_current_user = lambda: None
    get_db = lambda: None
    Base = object
    class User:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

client = TestClient(app)

# Setup In-Memory DB for testing to avoid polluting the real DB
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

if hasattr(Base, "metadata"):
    Base.metadata.create_all(bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

# Mock Users
ADMIN_USER = User(id=1, username="admin", role="administrator")
READONLY_USER = User(id=2, username="viewer", role="read-only")

def mock_admin_auth():
    return ADMIN_USER

def mock_readonly_auth():
    return READONLY_USER

class TestVaultEndpoints:
    @patch("os.remove")
    @patch("os.path.exists")
    def test_delete_vault_item(self, mock_exists, mock_remove):
        app.dependency_overrides[get_current_user] = mock_admin_auth
        mock_exists.return_value = True
        
        filename = "test-plugin.zip"
        # Mock abspath to ensure security check passes in test environment
        with patch("os.path.abspath") as mock_abspath:
            mock_abspath.side_effect = lambda p: p
            
            response = client.delete(f"/api/v1/vault/{filename}")
            
            assert response.status_code == 200
            assert response.json() == {"status": "deleted", "filename": filename}
            mock_remove.assert_called_once()
        
        app.dependency_overrides = {}

    @patch("os.path.abspath")
    def test_delete_vault_item_traversal(self, mock_abspath):
        app.dependency_overrides[get_current_user] = mock_admin_auth
        
        # Mock abspath to simulate traversal resolution
        def side_effect(path):
            if "vault" in path and ".." not in path:
                return "/opt/wordops-gui/vault"
            return "/etc/passwd" # Simulating resolved path for ../../etc/passwd
            
        mock_abspath.side_effect = side_effect
        
        response = client.delete("/api/v1/vault/../../etc/passwd")
        
        assert response.status_code == 403
        assert "Forbidden" in response.json()["detail"]
        
        app.dependency_overrides = {}

class TestSiteEndpoints:
    @patch("wordops.WordOpsService.list_sites")
    def test_list_sites(self, mock_list):
        app.dependency_overrides[get_current_user] = mock_admin_auth
        
        mock_list.return_value = [
            {"id": 1, "domain": "example.com", "status": "online", "php": "8.1", "ssl": True, "cache": "Redis", "db": True}
        ]
        
        response = client.get("/api/v1/sites")
        
        assert response.status_code == 200
        assert len(response.json()) == 1
        assert response.json()[0]["domain"] == "example.com"
        
        app.dependency_overrides = {}

    def test_create_site_validation(self):
        app.dependency_overrides[get_current_user] = mock_admin_auth
        
        # Invalid domain
        response = client.post("/api/v1/sites", json={"domain": "invalid_domain", "php_version": "8.1"})
        
        assert response.status_code == 422
        
        app.dependency_overrides = {}

    @patch("wordops.WordOpsService.run_command")
    def test_clear_cache(self, mock_run):
        app.dependency_overrides[get_current_user] = mock_admin_auth
        
        response = client.post("/api/v1/sites/example.com/cache/clear")
        
        assert response.status_code == 200
        assert "initiated" in response.json()["message"]
        mock_run.assert_called_with(["wo", "site", "clean", "example.com", "--all"])
        
        app.dependency_overrides = {}

    @patch("wordops.WordOpsService.run_command")
    def test_update_php_version(self, mock_run):
        app.dependency_overrides[get_current_user] = mock_admin_auth
        
        response = client.put("/api/v1/sites/example.com/stack", json={"php_version": "8.2"})
        
        assert response.status_code == 200
        mock_run.assert_called_with(["wo", "site", "update", "example.com", "--php=8.2"])
        
        app.dependency_overrides = {}

class TestServiceEndpoints:
    @patch("subprocess.run")
    def test_service_restart_action(self, mock_run):
        app.dependency_overrides[get_current_user] = mock_admin_auth
        
        # Mock successful systemctl execution
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_run.return_value = mock_proc
        
        response = client.post("/api/v1/system/services", 
                             json={"service": "nginx", "action": "restart"})
        
        assert response.status_code == 200
        assert response.json()["status"] == "success"
        assert "nginx" in response.json()["message"]
        
        app.dependency_overrides = {}

    def test_service_action_forbidden(self):
        app.dependency_overrides[get_current_user] = mock_readonly_auth
        
        response = client.post("/api/v1/system/services", 
                             json={"service": "nginx", "action": "restart"})
        
        # Should be 403 Forbidden for non-admins
        assert response.status_code == 403
            
        app.dependency_overrides = {}

class TestBulkDeploy:
    @patch("main.create_provisioning_task")
    def test_bulk_deploy(self, mock_create_task):
        app.dependency_overrides[get_current_user] = mock_admin_auth
        
        payload = {
            "domains": ["site1.com", "site2.com"],
            "php_version": "8.1",
            "features": [],
            "plugins": []
        }
        response = client.post("/api/v1/bulk/deploy", json=payload)
        
        assert response.status_code == 200
        assert "2 sites" in response.json()["message"]
        assert mock_create_task.call_count == 2
        
        app.dependency_overrides = {}

class TestSettingsEndpoints:
    def test_update_settings_success(self):
        app.dependency_overrides[get_current_user] = mock_admin_auth
        
        # Mock DB and password verification
        with patch("main.pwd_context.verify") as mock_verify, \
             patch("main.pwd_context.hash") as mock_hash:
            
            mock_verify.return_value = True
            mock_hash.return_value = "new_hashed_password"
            
            payload = {
                "username": "admin",
                "current_password": "old_password",
                "new_password": "new_password"
            }
            
            response = client.post("/api/v1/settings", json=payload)
            
            assert response.status_code == 200
            assert response.json()["status"] == "success"
            
        app.dependency_overrides = {}

    def test_update_settings_invalid_password(self):
        app.dependency_overrides[get_current_user] = mock_admin_auth
        
        with patch("main.pwd_context.verify") as mock_verify:
            mock_verify.return_value = False
            
            payload = {
                "current_password": "wrong_password",
                "new_password": "new_password"
            }
            
            response = client.post("/api/v1/settings", json=payload)
            
            assert response.status_code == 400
            assert "Invalid current password" in response.json()["detail"]
            
        app.dependency_overrides = {}

    def test_log_health_check(self):
        app.dependency_overrides[get_current_user] = mock_admin_auth
        
        with patch("os.path.exists") as mock_exists, \
             patch("os.access") as mock_access:
            
            # Mock some existing, some missing
            def side_effect(path):
                return path == "/var/log/nginx/access.log"
            
            mock_exists.side_effect = side_effect
            mock_access.return_value = True
            
            response = client.get("/api/v1/system/logs/health")
            
            assert response.status_code == 200
            data = response.json()
            assert data["nginx-access"]["status"] == "ok"
            assert data["nginx-error"]["status"] == "error"
            
        app.dependency_overrides = {}

class TestNginxConfig:
    @patch("builtins.open", new_callable=mock_open, read_data="old_config")
    @patch("subprocess.run")
    @patch("os.path.exists")
    def test_save_nginx_config_success(self, mock_exists, mock_run, mock_file):
        app.dependency_overrides[get_current_user] = mock_admin_auth
        mock_exists.return_value = True
        
        # Mock nginx -t success and reload success
        mock_run.side_effect = [
            MagicMock(returncode=0), # nginx -t
            MagicMock(returncode=0)  # systemctl reload
        ]
        
        response = client.post("/api/v1/sites/example.com/nginx", json={"config": "new_config"})
        
        assert response.status_code == 200
        # Check if file was written with new config
        mock_file().write.assert_any_call("new_config")
        
        app.dependency_overrides = {}

    @patch("builtins.open", new_callable=mock_open, read_data="old_config")
    @patch("subprocess.run")
    @patch("os.path.exists")
    def test_save_nginx_config_validation_fail(self, mock_exists, mock_run, mock_file):
        app.dependency_overrides[get_current_user] = mock_admin_auth
        mock_exists.return_value = True
        
        # Mock nginx -t failure
        mock_run.return_value = MagicMock(returncode=1, stderr="Syntax error")
        
        response = client.post("/api/v1/sites/example.com/nginx", json={"config": "bad_config"})
        
        assert response.status_code == 400
        assert "NGINX config validation failed" in response.json()["detail"]
        
        # Verify revert happened (wrote old_config back)
        mock_file().write.assert_any_call("old_config")
        
        app.dependency_overrides = {}

class TestWPDownload:
    @patch("requests.get")
    @patch("builtins.open", new_callable=mock_open)
    def test_download_wp_plugin(self, mock_file, mock_get):
        app.dependency_overrides[get_current_user] = mock_admin_auth
        
        # Mock response for info query
        mock_response_info = MagicMock()
        mock_response_info.status_code = 200
        mock_response_info.json.return_value = {"download_link": "http://example.com/plugin.zip"}
        
        # Mock response for file download
        mock_response_file = MagicMock()
        mock_response_file.status_code = 200
        mock_response_file.iter_content.return_value = [b"chunk1", b"chunk2"]
        
        mock_get.side_effect = [mock_response_info, mock_response_file]
        
        payload = {"slug": "test-plugin", "type": "plugin"}
        response = client.post("/api/v1/vault/download-wp", json=payload)
        
        assert response.status_code == 200
        assert "initiated" in response.json()["message"]
        
        app.dependency_overrides = {}

class TestUserEndpoints:
    def test_delete_user_success(self):
        app.dependency_overrides[get_current_user] = mock_admin_auth
        
        # Create a user to delete
        db = TestingSessionLocal()
        user = User(username="todelete", role="read-only", hashed_password="hash")
        db.add(user)
        db.commit()
        user_id = user.id
        db.close()
        
        response = client.delete(f"/api/v1/users/{user_id}")
        assert response.status_code == 200
        assert response.json()["status"] == "deleted"
        
        # Verify deletion
        db = TestingSessionLocal()
        assert db.query(User).filter(User.id == user_id).first() is None
        db.close()
        
        app.dependency_overrides = {}

    def test_delete_self_failure(self):
        app.dependency_overrides[get_current_user] = mock_admin_auth
        # ADMIN_USER id is 1
        
        response = client.delete("/api/v1/users/1")
        assert response.status_code == 400
        assert "Cannot delete yourself" in response.json()["detail"]
        
        app.dependency_overrides = {}

    def test_delete_nonexistent_user(self):
        app.dependency_overrides[get_current_user] = mock_admin_auth
        
        response = client.delete("/api/v1/users/99999")
        assert response.status_code == 404
        assert "User not found" in response.json()["detail"]
        
        app.dependency_overrides = {}

    def test_update_user_role(self):
        app.dependency_overrides[get_current_user] = mock_admin_auth
        
        # Create user
        db = TestingSessionLocal()
        user = User(username="toupdate", role="read-only", hashed_password="hash")
        db.add(user)
        db.commit()
        user_id = user.id
        db.close()
        
        response = client.put(f"/api/v1/users/{user_id}", json={"role": "site-manager"})
        
        assert response.status_code == 200
        assert response.json()["role"] == "site-manager"
        
        # Verify DB
        db = TestingSessionLocal()
        updated = db.query(User).filter(User.id == user_id).first()
        assert updated.role == "site-manager"
        db.close()
        
        app.dependency_overrides = {}

class TestLogStreaming:
    @patch("main.get_current_user")
    @patch("asyncio.create_subprocess_exec")
    @patch("os.path.exists")
    def test_stream_log_success(self, mock_exists, mock_subprocess, mock_auth):
        # Mock auth
        async def mock_auth_fn(token, db):
            return ADMIN_USER
        mock_auth.side_effect = mock_auth_fn
        
        mock_exists.return_value = True
        
        # Mock subprocess
        mock_process = MagicMock()
        
        # Define async readline
        async def async_readline():
            if not hasattr(async_readline, "lines"):
                async_readline.lines = [b"log line 1\n", b"log line 2\n", b""]
            if async_readline.lines:
                return async_readline.lines.pop(0)
            return b""
            
        mock_process.stdout.readline = async_readline
        
        async def async_exec(*args, **kwargs):
            return mock_process
            
        mock_subprocess.side_effect = async_exec
        
        response = client.get("/api/v1/system/logs/stream/nginx-access?token=valid_token")
        
        assert response.status_code == 200
        assert b"data: log line 1" in response.content
        assert b"data: log line 2" in response.content

    @patch("main.get_current_user")
    @patch("os.path.exists")
    def test_stream_log_file_not_found(self, mock_exists, mock_auth):
        async def mock_auth_fn(token, db):
            return ADMIN_USER
        mock_auth.side_effect = mock_auth_fn
        
        mock_exists.return_value = False
        
        response = client.get("/api/v1/system/logs/stream/unknown?token=valid_token")
        
        assert response.status_code == 200
        assert b"Log file not found" in response.content

class TestPasswordReset:
    def test_password_reset_flow(self):
        # Setup user
        db = TestingSessionLocal()
        user = User(username="reset_user", hashed_password="old_hash", role="read-only")
        db.add(user)
        db.commit()
        
        # 1. Request Reset
        response = client.post("/api/v1/auth/request-password-reset", json={"email": "reset_user"})
        assert response.status_code == 200
        token = response.json()["token"]
        
        # 2. Verify Token
        response = client.post("/api/v1/auth/verify-reset-token", json={"token": token})
        assert response.status_code == 200
        assert response.json()["valid"] is True
        
        # 3. Reset Password
        with patch("main.pwd_context.hash") as mock_hash:
            mock_hash.return_value = "new_secure_hash"
            response = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "new_password"})
            assert response.status_code == 200
            
            # Verify DB update
            db.refresh(user)
            assert user.hashed_password == "new_secure_hash"
        db.close()

class TestMFAEndpoints:
    def test_mfa_setup_and_verify(self):
        # Create test user
        db = TestingSessionLocal()
        user = User(username="mfa_test", role="administrator", hashed_password="hash")
        db.add(user)
        db.commit()
        db.close()

        # Override auth to return DB-connected user so updates persist
        def mock_auth_db(db: Session = Depends(get_db)):
            return db.query(User).filter(User.username == "mfa_test").first()
        
        app.dependency_overrides[get_current_user] = mock_auth_db

        # 1. Setup
        response = client.post("/api/v1/auth/mfa/setup")
        assert response.status_code == 200
        data = response.json()
        secret = data["secret"]
        assert secret is not None
        assert "provisioning_uri" in data

        # 2. Verify
        totp = pyotp.TOTP(secret)
        token = totp.now()
        
        response = client.post("/api/v1/auth/mfa/verify", json={"token": token})
        assert response.status_code == 200
        assert "enabled successfully" in response.json()["message"]

        # 3. Verify DB
        db = TestingSessionLocal()
        u = db.query(User).filter(User.username == "mfa_test").first()
        assert u.mfa_enabled is True
        db.close()

        app.dependency_overrides = {}

    def test_mfa_disable(self):
        # Create user with MFA enabled
        db = TestingSessionLocal()
        secret = pyotp.random_base32()
        user = User(username="mfa_disable_test", role="administrator", hashed_password="hash", mfa_enabled=True, mfa_secret=secret)
        db.add(user)
        db.commit()
        db.close()

        def mock_auth_db(db: Session = Depends(get_db)):
            return db.query(User).filter(User.username == "mfa_disable_test").first()
        
        app.dependency_overrides[get_current_user] = mock_auth_db

        # Disable
        totp = pyotp.TOTP(secret)
        token = totp.now()
        
        response = client.post("/api/v1/auth/mfa/disable", json={"token": token})
        assert response.status_code == 200
        
        # Verify DB
        db = TestingSessionLocal()
        u = db.query(User).filter(User.username == "mfa_disable_test").first()
        assert u.mfa_enabled is False
        assert u.mfa_secret is None
        db.close()

        app.dependency_overrides = {}

if __name__ == "__main__":
    # Allow running directly
    pytest.main([__file__])