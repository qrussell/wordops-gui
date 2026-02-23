import os
import subprocess
import shutil
import zipfile  # Required for plugin extraction
import re
import requests 
import asyncio
import uuid
from fastapi import UploadFile, File, BackgroundTasks, FastAPI, Depends, HTTPException, status, Header
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, validator, ValidationError
from sqlalchemy import create_engine, Column, Integer, String, DateTime, JSON, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Request
from sqlalchemy.orm import relationship
import logging
import pyotp

# --- Audit Logging Setup ---
audit_log = logging.getLogger("audit")
audit_log.setLevel(logging.INFO)
# Use a file handler that doesn't lock on Windows
handler = logging.FileHandler("wordops-gui-audit.log", encoding="utf-8")
formatter = logging.Formatter('%(asctime)s - %(message)s')
handler.setFormatter(formatter)
audit_log.addHandler(handler)

# Import the service
from wordops import WordOpsService

# --- Config ---
SECRET_KEY = os.getenv("SECRET_KEY", "change-this-in-production-please")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
DATABASE_URL = "sqlite:///./wordops_gui.db"
FRONTEND_DIR = "/opt/wordops-gui/frontend"
VAULT_DIR = "/opt/wordops-gui/vault"
os.makedirs(VAULT_DIR, exist_ok=True)

# --- DB Setup ---
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 30})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="administrator")
    mfa_secret = Column(String, nullable=True)
    mfa_enabled = Column(Boolean, default=False)

class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, index=True)
    system_username = Column(String, unique=True, index=True) # e.g., 'cielo_client1'
    email = Column(String, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="active") # active, suspended

    # Link tenants to their WordPress sites
    sites = relationship("Site", back_populates="owner")

class Site(Base):
    __tablename__ = "sites"

    id = Column(Integer, primary_key=True, index=True)
    domain = Column(String, unique=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"))
    php_version = Column(String, default="8.1")
    created_at = Column(DateTime, default=datetime.utcnow)
    
    owner = relationship("Tenant", back_populates="sites")

Base.metadata.create_all(bind=engine)

# --- Pydantic Schemas ---
class SiteCreate(BaseModel):
    domain: str
    php_version: str = "8.1"
    features: List[str] = []
    plugins: List[str] = []
    tenant_id: Optional[int] = None

    @validator("domain")
    def validate_domain(cls, v):
        if not re.match(r'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$', v):
            raise ValueError("Invalid domain format")
        return v

class PasswordResetRequest(BaseModel):
    email: str

class PasswordReset(BaseModel):
    token: str
    new_password: str

class MfaSetupResponse(BaseModel):
    secret: str
    provisioning_uri: str

class MfaVerifyRequest(BaseModel):
    token: str

class TokenVerifyRequest(BaseModel):
    token: str

class MfaTokenRequest(BaseModel):
    mfa_token: str
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    mfa_required: Optional[bool] = False

class ServiceAction(BaseModel):
    service: str
    action: str  # start, stop, restart


class NginxConfig(BaseModel):
    config: str

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "read-only"

class UserUpdate(BaseModel):
    role: Optional[str] = None

class UserSettings(BaseModel):
    username: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None

class PHPExtensionAction(BaseModel):
    version: str = "8.1"
    extension: str
    action: str # enable, disable


# --- Security Utils ---
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None: raise HTTPException(status_code=401)
        # Check if MFA was completed if it's enabled
        user = db.query(User).filter(User.username == username).first()
        if user and user.mfa_enabled and not payload.get("mfa_passed", False):
            raise HTTPException(status_code=401, detail="MFA token required")
    except JWTError:
        raise HTTPException(status_code=401)
    if user is None: raise HTTPException(status_code=401)
    return user

def is_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "administrator":
        raise HTTPException(status_code=403, detail="Administrator privileges required")
    return current_user

# --- APP ---
app = FastAPI(title="WordOps GUI API")

@app.middleware("http")
async def audit_log_middleware(request: Request, call_next):
    # Try to decode token to get user for logging
    user = "anonymous"
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_signature": False}) # Just for logging
            user = payload.get("sub", "anonymous")
        except JWTError:
            pass # Token is invalid, user remains anonymous

    response = await call_next(request)
    
    audit_log.info(
        f"User: {user} | Method: {request.method} | Path: {request.url.path} | Status: {response.status_code} | IP: {request.client.host}"
    )
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API Routes ---

@app.post("/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not pwd_context.verify(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.mfa_enabled:
        if not form_data.client_secret: # In OAuth2, the MFA token can be passed in client_secret
             return {"access_token": "", "token_type": "bearer", "mfa_required": True}
        
        totp = pyotp.TOTP(user.mfa_secret)
        if not totp.verify(form_data.client_secret):
            raise HTTPException(status_code=401, detail="Invalid MFA token")
        
        mfa_passed = True
    else:
        mfa_passed = False

    access_token = create_access_token(data={"sub": user.username, "role": user.role, "mfa_passed": mfa_passed})
    audit_log.info(f"User {user.username} logged in successfully.")
    return {"access_token": access_token, "token_type": "bearer"}

def create_password_reset_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=1) # 1 hour expiry
    to_encode.update({"exp": expire, "type": "password-reset"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

@app.post("/api/v1/auth/request-password-reset")
def request_password_reset(request: PasswordResetRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == request.email).first()
    if not user:
        # Don't reveal if user exists
        return {"message": "If an account with that email exists, a password reset link has been sent."}

    # In a real app, you'd email this token
    token = create_password_reset_token(data={"sub": user.username})
    print(f"Password reset token for {user.username}: {token}") # For dev purposes
    
    return {"message": "Password reset token generated. Check server logs.", "token": token} # Return token for dev

@app.post("/api/v1/auth/verify-reset-token")
def verify_reset_token(request: TokenVerifyRequest):
    try:
        payload = jwt.decode(request.token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "password-reset":
            raise HTTPException(status_code=400, detail="Invalid token type")
        return {"valid": True, "username": payload.get("sub")}
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

@app.post("/api/v1/auth/reset-password")
def reset_password(request: PasswordReset, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(request.token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "password-reset":
            raise HTTPException(status_code=400, detail="Invalid token type")
        
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=400, detail="Invalid token")

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = pwd_context.hash(request.new_password)
    db.commit()
    audit_log.info(f"Password reset for user {username}.")

    return {"message": "Password updated successfully"}

@app.post("/api/v1/auth/mfa/setup", response_model=MfaSetupResponse)
def mfa_setup(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA is already enabled.")

    secret = pyotp.random_base32()
    current_user.mfa_secret = secret
    db.commit()
    audit_log.info(f"MFA setup initiated for user {current_user.username}.")

    provisioning_uri = pyotp.TOTP(secret).provisioning_uri(
        name=current_user.username, issuer_name="WordOps-GUI"
    )
    return {"secret": secret, "provisioning_uri": provisioning_uri}

@app.post("/api/v1/auth/mfa/verify")
def mfa_verify(request: MfaVerifyRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA is not set up.")
        
    totp = pyotp.TOTP(current_user.mfa_secret)
    if not totp.verify(request.token):
        raise HTTPException(status_code=400, detail="Invalid token.")

    current_user.mfa_enabled = True
    db.commit()
    audit_log.info(f"MFA enabled for user {current_user.username}.")
    return {"message": "MFA enabled successfully."}

@app.post("/api/v1/auth/mfa/disable")
def mfa_disable(request: MfaVerifyRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA is not enabled.")

    # Verify token before disabling
    totp = pyotp.TOTP(current_user.mfa_secret)
    if not totp.verify(request.token):
        raise HTTPException(status_code=400, detail="Invalid token.")

    current_user.mfa_enabled = False
    current_user.mfa_secret = None
    db.commit()
    audit_log.info(f"MFA disabled for user {current_user.username}.")
    return {"message": "MFA disabled successfully."}

# Aliases for 2FA (compatibility with checklist/frontend expectations)
app.post("/api/v1/auth/2fa/setup", include_in_schema=False)(mfa_setup)
app.post("/api/v1/auth/2fa/verify", include_in_schema=False)(mfa_verify)
app.post("/api/v1/auth/2fa/disable", include_in_schema=False)(mfa_disable)

@app.get("/api/v1/auth/me")
def read_users_me(current_user: User = Depends(get_current_user)):
    return {"username": current_user.username, "role": current_user.role, "mfa_enabled": current_user.mfa_enabled}

@app.post("/api/v1/settings")
def update_settings(
    settings: UserSettings,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if settings.username and settings.username != current_user.username:
        if db.query(User).filter(User.username == settings.username).first():
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = settings.username
    
    if settings.new_password:
        if not settings.current_password:
            raise HTTPException(status_code=400, detail="Current password required")
        if not pwd_context.verify(settings.current_password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail="Invalid current password")
        current_user.hashed_password = pwd_context.hash(settings.new_password)
        
    db.commit()
    audit_log.info(f"Settings updated for user {current_user.username}.")
    return {"status": "success", "message": "Settings updated"}

# --- Site Management ---

@app.get("/api/v1/sites")
def list_sites(current_user: User = Depends(get_current_user)):
    return WordOpsService.list_sites()

@app.get("/api/v1/sites/{domain}")
def get_site_details(domain: str, current_user: User = Depends(get_current_user)):
    return WordOpsService.get_site_info(domain)

def provision_site_task(domain: str, php_version: str, features: List[str], plugins: List[str], sys_user: str):
    try:
        # 1. Run WordOps create
        WordOpsService.create_site(domain, php_version, features)
        
        # 2. Enforce Multi-Tenant Isolation
        # Create system user if not exists
        try:
            subprocess.run(["id", "-u", sys_user], check=True, capture_output=True)
        except subprocess.CalledProcessError:
            subprocess.run(["useradd", "-m", "-s", "/bin/false", sys_user], check=True)

        # Create Custom PHP Pool
        pool_conf = f"[{sys_user}]\nuser = {sys_user}\ngroup = {sys_user}\nlisten = /run/php/php-fpm-{sys_user}.sock\nlisten.owner = www-data\nlisten.group = www-data\npm = ondemand\npm.max_children = 5\npm.process_idle_timeout = 10s\nchdir = /\n"
        pool_file = f"/etc/php/{php_version}/fpm/pool.d/{sys_user}.conf"
        with open(pool_file, "w") as f:
            f.write(pool_conf)
        
        subprocess.run(["systemctl", "restart", f"php{php_version}-fpm"], check=True)

        # Patch Nginx to use the new socket
        nginx_conf = f"/etc/nginx/sites-available/{domain}"
        if os.path.exists(nginx_conf):
            with open(nginx_conf, "r") as f:
                config = f.read()
            
            # Replace fastcgi_pass directive
            new_sock = f"unix:/run/php/php-fpm-{sys_user}.sock"
            config = re.sub(r"fastcgi_pass\s+[^;]+;", f"fastcgi_pass {new_sock};", config)
            
            with open(nginx_conf, "w") as f:
                f.write(config)
            
            subprocess.run(["nginx", "-t"], check=True)
            subprocess.run(["systemctl", "reload", "nginx"], check=True)

        # Fix Permissions
        site_root = f"/var/www/{domain}"
        subprocess.run(["chown", "-R", f"{sys_user}:{sys_user}", site_root], check=True)

        # Install Plugins/Themes
        if plugins:
            htdocs = os.path.join(site_root, "htdocs")
            for item in plugins:
                vault_path = os.path.join(VAULT_DIR, item)
                if os.path.exists(vault_path):
                    with zipfile.ZipFile(vault_path, 'r') as zip_ref:
                        is_theme = any(f.endswith('style.css') for f in zip_ref.namelist()[:5])
                        target = f"{htdocs}/wp-content/{'themes' if is_theme else 'plugins'}"
                        zip_ref.extractall(target)
            
            # Re-apply permissions after extraction
            subprocess.run(["chown", "-R", f"{sys_user}:{sys_user}", site_root], check=True)

    except Exception as e:
        print(f"Error provisioning site {domain}: {e}")
        audit_log.error(f"Provisioning failed for {domain}: {e}")

@app.post("/api/v1/sites")
def create_site(site: SiteCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db), admin: User = Depends(is_admin)):
    
    # Determine system user for isolation
    system_username = "www-data"
    if site.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == site.tenant_id).first()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        system_username = tenant.system_username
    else:
        # Generate a system username based on domain if no tenant specified
        # e.g. u_examplecom
        slug = re.sub(r'[^a-z0-9]', '', site.domain.split('.')[0])[:12]
        system_username = f"u_{slug}"

    background_tasks.add_task(provision_site_task, site.domain, site.php_version, site.features, site.plugins, system_username)
    audit_log.info(f"Site creation queued for {site.domain} by {admin.username} (User: {system_username}).")
    return {"message": "Provisioning queued", "status": "pending"}

@app.delete("/api/v1/sites/{domain}")
def delete_site(domain: str, background_tasks: BackgroundTasks, admin: User = Depends(is_admin)):
    background_tasks.add_task(WordOpsService.run_command, ["wo", "site", "delete", domain, "--no-prompt"])
    audit_log.info(f"Site deletion queued for {domain} by {admin.username}.")
    return {"message": f"Deletion initiated for {domain}", "status": "success"}

class SSLToggle(BaseModel):
    enabled: bool

@app.post("/api/v1/sites/{domain}/ssl")
def toggle_ssl(domain: str, payload: SSLToggle, background_tasks: BackgroundTasks, admin: User = Depends(is_admin)):
    command = ["wo", "site", "update", domain]
    if payload.enabled:
        command.append("--le")
    else:
        command.append("--le=off")
    
    background_tasks.add_task(WordOpsService.run_command, command)
    audit_log.info(f"SSL toggle queued for {domain} (enabled={payload.enabled}) by {admin.username}.")
    return {"message": f"SSL update for {domain} initiated."}

class PHPStackUpdate(BaseModel):
    php_version: str

@app.put("/api/v1/sites/{domain}/stack")
def update_php_version(domain: str, payload: PHPStackUpdate, background_tasks: BackgroundTasks, admin: User = Depends(is_admin)):
    command = ["wo", "site", "update", domain, f"--php={payload.php_version}"]
    background_tasks.add_task(WordOpsService.run_command, command)
    audit_log.info(f"PHP version update queued for {domain} to {payload.php_version} by {admin.username}.")
    return {"message": f"PHP version update for {domain} to {payload.php_version} initiated."}

@app.post("/api/v1/sites/{domain}/cache/clear")
def clear_cache(domain: str, background_tasks: BackgroundTasks, admin: User = Depends(is_admin)):
    command = ["wo", "site", "clean", domain, "--all"]
    background_tasks.add_task(WordOpsService.run_command, command)
    audit_log.info(f"Cache clear queued for {domain} by {admin.username}.")
    return {"message": f"Cache clearing for {domain} initiated."}


# --- NGINX & Logs ---

@app.get("/api/v1/sites/{domain}/nginx")
def get_nginx_config(domain: str, current_user: User = Depends(get_current_user)):
    config_path = f"/etc/nginx/sites-available/{domain}"
    if not os.path.exists(config_path):
        raise HTTPException(status_code=404, detail="Nginx config file not found.")
    
    with open(config_path, "r") as f:
        config_content = f.read()
        
    return {"config": config_content}

@app.post("/api/v1/sites/{domain}/nginx")
def save_nginx_config(domain: str, config: NginxConfig, background_tasks: BackgroundTasks, admin: User = Depends(is_admin)):
        
    config_path = f"/etc/nginx/sites-available/{domain}"
    if not os.path.exists(os.path.dirname(config_path)):
        raise HTTPException(status_code=404, detail="Nginx config directory not found.")

    if not os.path.exists(config_path):
        raise HTTPException(status_code=404, detail="Nginx config file not found.")

    # Read current config for backup
    try:
        with open(config_path, "r") as f:
            backup_content = f.read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read current config: {str(e)}")

    try:
        # Write the new config
        with open(config_path, "w") as f:
            f.write(config.config)
        
        # Test the new config
        test_result = subprocess.run(["sudo", "nginx", "-t"], capture_output=True, text=True)
        if test_result.returncode != 0:
            # Revert config
            with open(config_path, "w") as f:
                f.write(backup_content)
            raise HTTPException(status_code=400, detail=f"NGINX config validation failed: {test_result.stderr}")

        # Reload NGINX to apply the new config
        reload_result = subprocess.run(["sudo", "systemctl", "reload", "nginx"], capture_output=True, text=True)
        
        if reload_result.returncode != 0:
            # Revert config if reload fails
            with open(config_path, "w") as f:
                f.write(backup_content)
            raise HTTPException(status_code=500, detail=f"Failed to reload NGINX: {reload_result.stderr}")
            
        audit_log.info(f"NGINX config updated for {domain} by {admin.username}.")
        return {"message": "NGINX config saved and reloaded successfully."}
    except HTTPException:
        raise
    except Exception as e:
        # Emergency revert
        try:
            with open(config_path, "w") as f:
                f.write(backup_content)
        except:
            pass
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/sites/{domain}/logs")
def get_site_logs(domain: str, type: str = "access", current_user: User = Depends(get_current_user)):
    return WordOpsService.get_logs(domain, type)

@app.get("/api/v1/system/logs/health")
def check_log_health(current_user: User = Depends(get_current_user)):
    """Check availability of system log files."""
    log_map = {
        "audit": "/var/log/wo/wordops.log",
        "nginx-access": "/var/log/nginx/access.log",
        "nginx-error": "/var/log/nginx/error.log",
        "php": "/var/log/php/8.1/fpm/error.log"
    }
    
    health_status = {}
    for key, path in log_map.items():
        exists = os.path.exists(path)
        readable = os.access(path, os.R_OK) if exists else False
        health_status[key] = {
            "path": path,
            "exists": exists,
            "readable": readable,
            "status": "ok" if exists and readable else "error"
        }
    
    return health_status

@app.get("/api/v1/system/logs/stream/{log_type}")
async def stream_log(log_type: str, token: str, db: Session = Depends(get_db)):
    await get_current_user(token, db) # Manual authentication
    
    log_map = {
        "audit": "/var/log/wo/wordops.log",
        "nginx-access": "/var/log/nginx/access.log",
        "nginx-error": "/var/log/nginx/error.log",
        "php": "/var/log/php/8.1/fpm/error.log"
    }
    log_file = log_map.get(log_type)

    if not log_file or not os.path.exists(log_file):
        async def not_found_stream():
            yield f"data: [ERROR] Log file not found: {log_file or log_type}\n\n"
        return StreamingResponse(not_found_stream(), media_type="text/event-stream")

    async def log_generator():
        # Use tail -f to follow the log file
        process = await asyncio.create_subprocess_exec(
            "tail", "-f", "-n", "20", log_file,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        try:
            while True:
                line = await process.stdout.readline()
                if line:
                    yield f"data: {line.decode('utf-8', errors='replace').strip()}\n\n"
                else:
                    break
        except asyncio.CancelledError:
            process.terminate()
            print(f"Log stream for {log_type} cancelled.")
    
    return StreamingResponse(log_generator(), media_type="text/event-stream")

# --- System Stats & Services ---

@app.get("/api/v1/system/stats")
def get_system_stats(current_user: User = Depends(get_current_user)):
    return WordOpsService.get_system_stats()

@app.get("/api/v1/system/services")
def list_services(current_user: User = Depends(get_current_user)):
    return WordOpsService.get_services()

@app.post("/api/v1/system/services")
def manage_service(
    data: ServiceAction, 
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "administrator":
        raise HTTPException(status_code=403, detail="Admins only")
    
    service_map = {
        "nginx": "nginx",
        "php8.1-fpm": "php8.1-fpm",
        "mariadb": "mariadb",
        "mysql": "mariadb",
        "redis": "redis-server",
        "redis-server": "redis-server",
    }
    
    service_name = service_map.get(data.service.lower(), data.service)
    
    try:
        # Actually run systemctl
        result = subprocess.run(
            ["sudo", "systemctl", data.action, service_name],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0:
            audit_log.info(f"Service {service_name} {data.action}ed by {current_user.username}.")
            return {
                "status": "success",
                "service": service_name,
                "action": data.action,
                "message": f"Service {service_name} {data.action}ed successfully"
            }
        else:
            raise HTTPException(status_code=500, detail=result.stderr)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Command timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/stack/php/extensions")
def list_php_extensions(version: str = "8.1", current_user: User = Depends(get_current_user)):
    return WordOpsService.get_php_extensions(version)

@app.post("/api/v1/stack/php/extensions")
def manage_php_extension(
    data: PHPExtensionAction, 
    background_tasks: BackgroundTasks,
    admin: User = Depends(is_admin)
):
    if data.action not in ["enable", "disable"]:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    background_tasks.add_task(WordOpsService.manage_php_extension, data.version, data.extension, data.action)
    audit_log.info(f"PHP extension {data.extension} ({data.version}) {data.action} queued by {admin.username}.")
    return {"message": f"Extension {data.extension} {data.action}d. PHP-FPM restart queued."}

# --- User Management ---

@app.get("/api/v1/users")
def read_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(User).all()

@app.post("/api/v1/users")
def create_user(user: UserCreate, db: Session = Depends(get_db), admin: User = Depends(is_admin)):
    hashed_pw = pwd_context.hash(user.password)
    db_user = User(username=user.username, hashed_password=hashed_pw, role=user.role)
    db.add(db_user)
    db.commit()
    audit_log.info(f"User {user.username} created by {admin.username}.")
    return {"status": "created"}

@app.delete("/api/v1/users/{user_id}")
def delete_user(
    user_id: int, 
    db: Session = Depends(get_db),
    admin: User = Depends(is_admin)
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    user_to_delete = db.query(User).filter(User.id == user_id).first()
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent deleting the last admin
    if user_to_delete.role == "administrator":
        admin_count = db.query(User).filter(User.role == "administrator").count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last administrator")
    
    db.delete(user_to_delete)
    db.commit()
    audit_log.info(f"User {user_to_delete.username} (ID: {user_id}) deleted by {admin.username}.")
    return {"status": "deleted", "user_id": user_id}

@app.put("/api/v1/users/{user_id}")
def update_user(user_id: int, user_update: UserUpdate, db: Session = Depends(get_db), admin: User = Depends(is_admin)):
    
    user_to_update = db.query(User).filter(User.id == user_id).first()
    if not user_to_update:
        raise HTTPException(status_code=404, detail="User not found")

    if user_update.role:
        # Prevent removing the last admin
        if user_to_update.role == "administrator" and user_update.role != "administrator":
            admin_count = db.query(User).filter(User.role == "administrator").count()
            if admin_count <= 1:
                raise HTTPException(status_code=400, detail="Cannot change the role of the last administrator")
        user_to_update.role = user_update.role

    db.commit()
    db.refresh(user_to_update)
    audit_log.info(f"User {user_to_update.username} (ID: {user_id}) updated by {admin.username}. New role: {user_update.role}")
    return user_to_update

class TenantUpdate(BaseModel):
    status: str

@app.get("/api/v1/tenants")
def list_tenants(db: Session = Depends(get_db), admin: User = Depends(is_admin)):
    tenants = db.query(Tenant).all()
    return [{
        "id": t.id,
        "username": t.system_username,
        "email": t.email,
        "status": t.status,
        "created_at": t.created_at,
        "site_count": len(t.sites)
    } for t in tenants]

@app.put("/api/v1/tenants/{tenant_id}")
def update_tenant(tenant_id: int, payload: TenantUpdate, db: Session = Depends(get_db), admin: User = Depends(is_admin)):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    tenant.status = payload.status
    db.commit()
    db.refresh(tenant)
    audit_log.info(f"Tenant {tenant.system_username} status updated to {payload.status} by {admin.username}")
    return tenant

@app.delete("/api/v1/tenants/{tenant_id}")
def delete_tenant(tenant_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), admin: User = Depends(is_admin)):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Gather info for background deletion
    username = tenant.system_username
    
    def background_delete(user: str, sites_data: List[dict]):
        # Delete sites
        for s in sites_data:
            try:
                WordOpsService.run_command(["wo", "site", "delete", s['domain'], "--no-prompt"])
            except Exception as e:
                print(f"Error deleting site {s['domain']}: {e}")
        
        # Kill user processes and delete user
        try:
            subprocess.run(["pkill", "-u", user], check=False)
            subprocess.run(["userdel", "-r", user], check=False)
        except Exception as e:
            print(f"Error deleting user {user}: {e}")
            
        # Cleanup pools (check common versions)
        for ver in ["8.0", "8.1", "8.2", "8.3"]:
            pool = f"/etc/php/{ver}/fpm/pool.d/{user}.conf"
            if os.path.exists(pool):
                os.remove(pool)
                subprocess.run(["systemctl", "restart", f"php{ver}-fpm"], check=False)

    sites_info = [{"domain": s.domain} for s in tenant.sites]
    background_tasks.add_task(background_delete, username, sites_info)
    
    db.delete(tenant)
    db.commit()
    audit_log.info(f"Tenant {username} deleted by {admin.username}")
    return {"status": "deleted"}

class BulkDeployRequest(BaseModel):
    domains: List[str]
    php_version: str = "8.1"
    features: List[str] = []
    plugins: List[str] = []
    tenant_id: Optional[int] = None

@app.post("/api/v1/bulk/deploy")
def bulk_deploy_sites(payload: BulkDeployRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db), admin: User = Depends(is_admin)):
    job_id = str(uuid.uuid4())
    
    # Determine tenant system user if tenant_id is provided
    tenant_system_user = None
    if payload.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == payload.tenant_id).first()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        tenant_system_user = tenant.system_username

    for domain in payload.domains:
        try:
            # Validate domain format
            if not re.match(r'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$', domain):
                print(f"Skipping invalid domain {domain}")
                continue

            # Determine system user for this site
            if tenant_system_user:
                system_username = tenant_system_user
            else:
                slug = re.sub(r'[^a-z0-9]', '', domain.split('.')[0])[:12]
                system_username = f"u_{slug}"

            background_tasks.add_task(
                provision_site_task,
                domain,
                payload.php_version,
                payload.features,
                payload.plugins,
                system_username
            )
        except Exception as e:
            print(f"Error queuing site {domain}: {e}")
            continue

    audit_log.info(f"Bulk deployment queued for {len(payload.domains)} sites by {admin.username}. Job ID: {job_id}")
    return {"status": "queued", "job_id": job_id, "message": f"{len(payload.domains)} sites are being provisioned."}

# --- Billing API (FOSSBilling Integration) ---

BILLING_API_KEY = os.getenv("BILLING_API_KEY", "change-this-billing-key")

def verify_billing_key(x_billing_key: str = Header(..., alias="X-Billing-Key")):
    if x_billing_key != BILLING_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid Billing Key")

class BillingCreateRequest(BaseModel):
    domain: str
    username: str
    email: str
    php_version: str = "8.1"
    features: List[str] = []
    plugins: List[str] = []

class BillingDomainRequest(BaseModel):
    domain: str

@app.post("/api/v1/billing/create", dependencies=[Depends(verify_billing_key)])
def billing_create_site(
    payload: BillingCreateRequest, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db)
):
    # Check if tenant exists
    tenant = db.query(Tenant).filter(Tenant.system_username == payload.username).first()
    if not tenant:
        tenant = Tenant(
            system_username=payload.username,
            email=payload.email,
            status="active"
        )
        db.add(tenant)
        db.commit()
        db.refresh(tenant)
    
    # Check if site exists
    if db.query(Site).filter(Site.domain == payload.domain).first():
        raise HTTPException(status_code=400, detail="Site already exists")

    # Create Site record
    new_site = Site(
        domain=payload.domain,
        tenant_id=tenant.id,
        php_version=payload.php_version
    )
    db.add(new_site)
    db.commit()

    # Queue provisioning
    background_tasks.add_task(
        provision_site_task, 
        payload.domain, 
        payload.php_version, 
        payload.features, 
        payload.plugins, 
        payload.username
    )
    
    audit_log.info(f"Billing: Site creation queued for {payload.domain} (Tenant: {payload.username})")
    return {"status": "queued", "domain": payload.domain}

@app.post("/api/v1/billing/suspend", dependencies=[Depends(verify_billing_key)])
def billing_suspend_site(payload: BillingDomainRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    site = db.query(Site).filter(Site.domain == payload.domain).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    def suspend_task(domain: str):
        # Unlink from sites-enabled
        enabled_link = f"/etc/nginx/sites-enabled/{domain}"
        if os.path.exists(enabled_link):
            os.remove(enabled_link)
            subprocess.run(["systemctl", "reload", "nginx"], check=False)
            audit_log.info(f"Billing: Site {domain} suspended (Nginx disabled)")
    
    background_tasks.add_task(suspend_task, payload.domain)
    return {"status": "suspended", "domain": payload.domain}

@app.post("/api/v1/billing/terminate", dependencies=[Depends(verify_billing_key)])
def billing_terminate_site(payload: BillingDomainRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    site = db.query(Site).filter(Site.domain == payload.domain).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    tenant = db.query(Tenant).filter(Tenant.id == site.tenant_id).first()
    sys_user = tenant.system_username if tenant else None

    def terminate_task(domain: str, user: str, php_ver: str):
        try:
            WordOpsService.run_command(["wo", "site", "delete", domain, "--no-prompt"])
            if user:
                pool_file = f"/etc/php/{php_ver}/fpm/pool.d/{user}.conf"
                if os.path.exists(pool_file):
                    os.remove(pool_file)
                    subprocess.run(["systemctl", "restart", f"php{php_ver}-fpm"], check=False)
                subprocess.run(["pkill", "-u", user], check=False)
                subprocess.run(["userdel", "-r", user], check=False)
        except Exception as e:
            audit_log.error(f"Billing: Termination failed for {domain}: {e}")

    background_tasks.add_task(terminate_task, site.domain, sys_user, site.php_version)
    db.delete(site)
    db.commit()
    
    audit_log.info(f"Billing: Site termination queued for {payload.domain}")
    return {"status": "terminating", "domain": payload.domain}

@app.post("/api/v1/billing/sso", dependencies=[Depends(verify_billing_key)])
def billing_sso(payload: BillingDomainRequest, db: Session = Depends(get_db)):
    site = db.query(Site).filter(Site.domain == payload.domain).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    try:
        site_root = f"/var/www/{payload.domain}/htdocs"
        cmd_get_admin = ["wp", "user", "list", "--role=administrator", "--field=user_login", "--path=" + site_root, "--allow-root"]
        admins = subprocess.check_output(cmd_get_admin).decode().splitlines()
        if not admins: raise HTTPException(status_code=400, detail="No admin user found")
        cmd_login = ["wp", "login", "create", admins[0], "--porcelain", "--path=" + site_root, "--allow-root"]
        return {"url": subprocess.check_output(cmd_login).decode().strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Vault / Library ---

@app.get("/api/v1/vault")
def list_vault_items(current_user: User = Depends(get_current_user)):
    """Lists files in the vault with type detection."""
    try:
        items = []
        for f in os.listdir(VAULT_DIR):
            if f.endswith('.zip'):
                path = os.path.join(VAULT_DIR, f)
                item_type = "plugin" # Default
                
                try:
                    with zipfile.ZipFile(path, 'r') as zip_ref:
                        # Themes must have a style.css in the root or first subdirectory
                        if any('style.css' in name for name in zip_ref.namelist()):
                            item_type = "theme"
                except:
                    pass

                size_mb = round(os.path.getsize(path) / (1024 * 1024), 2)
                items.append({
                    "name": f, 
                    "size": f"{size_mb} MB",
                    "type": item_type
                })
        return {"items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/vault/upload")
async def upload_to_vault(file: UploadFile = File(...), admin: User = Depends(is_admin)):
    file_path = os.path.join(VAULT_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    audit_log.info(f"File {file.filename} uploaded to vault by {admin.username}.")
    return {"filename": file.filename, "status": "uploaded"}

@app.delete("/api/v1/vault/{filename}")
def delete_vault_item(filename: str, admin: User = Depends(is_admin)):
    """Deletes a file from the vault."""

    file_path = os.path.join(VAULT_DIR, filename)
    
    # Security: Ensure the path is within the vault
    if not os.path.abspath(file_path).startswith(os.path.abspath(VAULT_DIR)):
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        os.remove(file_path)
        audit_log.info(f"File {filename} deleted from vault by {admin.username}.")
        return {"status": "deleted", "filename": filename}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class WPDownloadRequest(BaseModel):
    slugs: Optional[List[str]] = []
    slug: Optional[str] = None
    type: str = "plugin" # 'plugin' or 'theme'

@app.post("/api/v1/vault/download-wp")
def download_from_wp_org(request: WPDownloadRequest, background_tasks: BackgroundTasks, admin: User = Depends(is_admin)):
    
    targets = request.slugs.copy()
    if request.slug:
        targets.append(request.slug)
    
    def download_task():
        for slug in targets:
            try:
                api_url = f"https://api.wordpress.org/{request.type}s/info/1.2/?action=query_plugins&request[slug]={slug}"
                if request.type == 'theme':
                    api_url = f"https://api.wordpress.org/themes/info/1.2/?action=theme_information&request[slug]={slug}"

                response = requests.get(api_url, timeout=10)
                if response.status_code != 200:
                    print(f"Could not find info for {slug}")
                    continue
                
                data = response.json()
                if not data.get("download_link"):
                    print(f"No download link for {slug}")
                    continue

                download_url = data["download_link"]
                filename = os.path.basename(download_url)
                filepath = os.path.join(VAULT_DIR, filename)

                with requests.get(download_url, stream=True, timeout=30) as r:
                    r.raise_for_status()
                    with open(filepath, 'wb') as f:
                        for chunk in r.iter_content(chunk_size=8192):
                            f.write(chunk)
                print(f"Downloaded {slug} to {filepath}")
            except Exception as e:
                print(f"Failed to download {slug}: {e}")
                audit_log.error(f"Failed to download {slug}: {e}")

    background_tasks.add_task(download_task)
    audit_log.info(f"WordPress download queued for {targets} by {admin.username}.")
    return {"message": "Downloads initiated in the background."}

# --- Static Serving ---
assets_path = os.path.join(FRONTEND_DIR, "assets")
if os.path.exists(assets_path):
    app.mount("/assets", StaticFiles(directory=assets_path), name="assets")
else:
    print(f"Warning: Assets directory not found at {assets_path}")

@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    if "." in full_path and not full_path.endswith(".html"):
        raise HTTPException(status_code=404)
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    return FileResponse(index_path) if os.path.exists(index_path) else {"error": "Frontend not found"}

@app.on_event("startup")
def startup_db():
    db = SessionLocal()
    if not db.query(User).filter(User.username == "admin").first():
        initial_password = os.getenv("INITIAL_ADMIN_PASSWORD", "password")
        db.add(User(username="admin", hashed_password=pwd_context.hash(initial_password), role="administrator"))
        db.commit()
    db.close()