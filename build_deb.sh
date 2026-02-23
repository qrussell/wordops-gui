#!/bin/bash

# Configuration
APP_NAME="wordops-gui"
VERSION="1.0.1"
ARCH="amd64"
MAINTAINER="Quentin Russell <quentin@cielocloudhost.com>"
DESC="Graphical Control Panel for WordOps"
BUILD_DIR="build_stage"
OUTPUT_DEB="${APP_NAME}_${VERSION}_${ARCH}.deb"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# --- PRE-FLIGHT CHECKS ---
echo -e "${GREEN}Starting build process for $APP_NAME version $VERSION...${NC}"

if [ ! -f "backend/requirements.txt" ]; then
    echo -e "${RED}Error: backend/requirements.txt is missing!${NC}"
    echo "Please run: pip freeze > backend/requirements.txt inside your backend folder."
    exit 1
fi

# Locate the systemd service file (checking root and system/ folder)
if [ -f "wogui.service" ]; then
    SERVICE_FILE="wogui.service"
elif [ -f "system/wogui.service" ]; then
    SERVICE_FILE="system/wogui.service"
else
    echo -e "${RED}Error: wogui.service is missing!${NC}"
    exit 1
fi

# --- CLEANUP ---
echo "Cleaning up previous build artifacts..."
rm -rf "$BUILD_DIR"
rm -f "$OUTPUT_DEB"
rm -rf frontend/dist

# --- BUILD FRONTEND ---
echo -e "${GREEN}Building React Frontend...${NC}"
if [ -d "frontend" ]; then
    cd frontend
    
    # Ensure npm is available
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}Error: npm is not installed.${NC}"
        exit 1
    fi

    echo "Installing dependencies (including Tailwind)..."
    npm install --include=dev  # Critical: Ensure devDependencies like Tailwind are installed
    
    echo "Compiling assets..."
    npm run build
    
    if [ ! -d "dist" ]; then
        echo -e "${RED}Error: Frontend build failed. 'dist' directory not found.${NC}"
        exit 1
    fi
    cd ..
else
    echo -e "${RED}Error: frontend directory not found.${NC}"
    exit 1
fi

# --- PREPARE DIRECTORIES ---
echo "Creating Debian directory structure..."
mkdir -p "$BUILD_DIR/DEBIAN"
mkdir -p "$BUILD_DIR/opt/$APP_NAME/backend"
# Keep the 'dist' folder structure intact so main.py finds it easily
mkdir -p "$BUILD_DIR/opt/$APP_NAME/frontend" 
mkdir -p "$BUILD_DIR/etc/systemd/system"

# --- COPY FILES ---
echo "Copying Backend files..."
# Copy everything in backend, then remove dev artifacts so the package stays lightweight
cp -r backend/* "$BUILD_DIR/opt/$APP_NAME/backend/"
rm -rf "$BUILD_DIR/opt/$APP_NAME/backend/venv"
rm -rf "$BUILD_DIR/opt/$APP_NAME/backend/__pycache__"
rm -rf "$BUILD_DIR/opt/$APP_NAME/backend/.pytest_cache"

echo "Copying Frontend files..."
# Copy the entire dist folder directly into the frontend directory
cp -r frontend/dist "$BUILD_DIR/opt/$APP_NAME/frontend/"

echo "Copying Systemd Service..."
cp "$SERVICE_FILE" "$BUILD_DIR/etc/systemd/system/wogui.service"

# --- GENERATE CONTROL FILE ---
echo "Generating DEBIAN/control..."
cat <<EOF > "$BUILD_DIR/DEBIAN/control"
Package: $APP_NAME
Version: $VERSION
Section: admin
Priority: optional
Architecture: $ARCH
Depends: python3, python3-venv, python3-pip, nginx
Maintainer: $MAINTAINER
Description: $DESC
 A web-based graphical user interface for WordOps.
 Runs as root to execute 'wo' commands securely.
EOF

# --- GENERATE POST-INSTALL SCRIPT ---
echo "Generating DEBIAN/postinst..."
cat <<EOF > "$BUILD_DIR/DEBIAN/postinst"
#!/bin/bash
set -e

APP_HOME="/opt/$APP_NAME"
BACKEND_DIR="\$APP_HOME/backend"

# 1. Setup Python Virtual Environment
echo "Setting up Python virtual environment..."
cd "\$BACKEND_DIR"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

# 2. Install Dependencies
echo "Installing Python dependencies..."
source venv/bin/activate
pip install --upgrade pip
# Force install specific versions to avoid conflicts
pip install -r requirements.txt
deactivate

# 3. Set Permissions (ROOT for WordOps compatibility)
echo "Setting permissions to root:root..."
chown -R root:root "\$APP_HOME"
chmod -R 755 "\$APP_HOME"

# Special handling for SQLite database directory to prevent locking
# Even root processes can fail if multiple threads try to write to a locked file
# This ensures the directory is definitely writable.
chmod 775 "\$BACKEND_DIR"

# 4. Service Management
echo "Configuring Systemd service..."
systemctl daemon-reload
systemctl enable wogui.service
systemctl restart wogui.service

echo "-----------------------------------------------------"
echo "WordOps GUI installed successfully!"
echo "Service is running as root on port 8000."
echo "-----------------------------------------------------"

exit 0
EOF

# --- GENERATE PRE-REMOVE SCRIPT ---
echo "Generating DEBIAN/prerm..."
cat <<EOF > "$BUILD_DIR/DEBIAN/prerm"
#!/bin/bash
set -e

echo "Stopping WordOps GUI service..."
systemctl stop wogui.service || true
systemctl disable wogui.service || true

# Cleanup venv and cache
rm -rf /opt/$APP_NAME/backend/venv
rm -rf /opt/$APP_NAME/backend/__pycache__

exit 0
EOF

# --- FINALIZE BUILD ---
chmod 755 "$BUILD_DIR/DEBIAN/postinst"
chmod 755 "$BUILD_DIR/DEBIAN/prerm"

echo -e "${GREEN}Building .deb package...${NC}"
dpkg-deb --build "$BUILD_DIR" "$OUTPUT_DEB"

echo -e "${GREEN}Build Complete!${NC}"
echo -e "Installer created: ${YELLOW}$OUTPUT_DEB${NC}"