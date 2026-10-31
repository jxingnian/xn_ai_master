param(
    [Parameter(Mandatory = $true)]
    [string]$Server,
    [string]$User = "root",
    [string]$RemoteProject = "/opt/xn-platform",
    [int]$Port = 22
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ArchiveName = "xn_ai_master_update.tar.gz"
$ArchivePath = Join-Path $env:TEMP $ArchiveName
$RemoteArchive = "/tmp/$ArchiveName"
$RemoteScript = "/tmp/xn_ai_master_update.sh"
$LocalScript = Join-Path $env:TEMP "xn_ai_master_update.sh"
$Target = "$User@$Server"

function Write-Step([string]$Message) {
    Write-Host "[update] $Message" -ForegroundColor Cyan
}

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

try {
    Require-Command "ssh"
    Require-Command "scp"
    Require-Command "tar"

    if (-not (Test-Path (Join-Path $ProjectRoot "build/install.sh"))) {
        throw "build/install.sh was not found in the project."
    }

    Write-Step "Creating source archive."
    if (Test-Path $ArchivePath) {
        Remove-Item -LiteralPath $ArchivePath -Force
    }

    # 鍙笂浼犳簮鐮佸拰鏋勫缓鑴氭湰锛屼笉涓婁紶渚濊禆銆佹瀯寤轰骇鐗┿€佺幆澧冮厤缃拰涓存椂鏂囦欢銆?    Push-Location $ProjectRoot
    try {
        & tar -czf $ArchivePath backend frontend build
    }
    finally {
        Pop-Location
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Archive creation failed. Exit code: $LASTEXITCODE"
    }

    Write-Step "Uploading source to $Target on port $Port."
    & scp -P $Port $ArchivePath "${Target}:$RemoteArchive"
    if ($LASTEXITCODE -ne 0) {
        throw "Upload failed. Exit code: $LASTEXITCODE"
    }

    Write-Step "Building and switching the remote application."
    $RemoteCommand = @"
set -Eeuo pipefail
PROJECT_ROOT='$RemoteProject'
ARCHIVE='$RemoteArchive'
SERVICE_NAME='xn-platform'
TIMESTAMP="__DOLLAR__(date +%Y%m%d_%H%M%S)"
STAGE="/opt/xn-platform-update-__DOLLAR__TIMESTAMP"
BACKUP="/opt/xn-platform-backup-__DOLLAR__TIMESTAMP"

cleanup() {
    rm -f "__DOLLAR__ARCHIVE"
}
trap cleanup EXIT

mkdir -p "__DOLLAR__STAGE"
tar -xzf "__DOLLAR__ARCHIVE" -C "__DOLLAR__STAGE"

if [ ! -f "__DOLLAR__STAGE/backend/package.json" ] || [ ! -f "__DOLLAR__STAGE/frontend/package.json" ]; then
    echo '[update] source archive is incomplete' >&2
    exit 1
fi

cd "__DOLLAR__STAGE/backend"
if [ -f package-lock.json ]; then
    npm ci --registry=https://registry.npmmirror.com
else
    npm install --registry=https://registry.npmmirror.com
fi
npm run build

cd "__DOLLAR__STAGE/frontend"
if [ -f package-lock.json ]; then
    npm ci --registry=https://registry.npmmirror.com
else
    npm install --registry=https://registry.npmmirror.com
fi
npm run build

if [ ! -f "__DOLLAR__STAGE/backend/dist/main.js" ] || [ ! -f "__DOLLAR__STAGE/frontend/dist/index.html" ]; then
    echo '[update] build output is incomplete' >&2
    exit 1
fi

systemctl stop "__DOLLAR__SERVICE_NAME"
mkdir -p "__DOLLAR__BACKUP"
mv "__DOLLAR__PROJECT_ROOT/backend" "__DOLLAR__BACKUP/backend"
mv "__DOLLAR__PROJECT_ROOT/frontend" "__DOLLAR__BACKUP/frontend"
mv "__DOLLAR__STAGE/backend" "__DOLLAR__PROJECT_ROOT/backend"
mv "__DOLLAR__STAGE/frontend" "__DOLLAR__PROJECT_ROOT/frontend"

mkdir -p /var/www/xn-platform-update
rm -rf /var/www/xn-platform-update/*
cp -a "__DOLLAR__PROJECT_ROOT/frontend/dist/." /var/www/xn-platform-update/
rm -rf /var/www/xn-platform/*
cp -a /var/www/xn-platform-update/. /var/www/xn-platform/
rm -rf /var/www/xn-platform-update

chown -R xnplatform:xnplatform "__DOLLAR__PROJECT_ROOT/backend" "__DOLLAR__PROJECT_ROOT/frontend"
systemctl start "__DOLLAR__SERVICE_NAME"
systemctl is-active --quiet "__DOLLAR__SERVICE_NAME"

if ! curl -fsS --max-time 10 http://127.0.0.1/ >/dev/null; then
    echo '[update] website health check failed; restoring old application' >&2
    systemctl stop "__DOLLAR__SERVICE_NAME" || true
    rm -rf "__DOLLAR__PROJECT_ROOT/backend" "__DOLLAR__PROJECT_ROOT/frontend"
    mv "__DOLLAR__BACKUP/backend" "__DOLLAR__PROJECT_ROOT/backend"
    mv "__DOLLAR__BACKUP/frontend" "__DOLLAR__PROJECT_ROOT/frontend"
    rm -rf /var/www/xn-platform/*
    cp -a "__DOLLAR__PROJECT_ROOT/frontend/dist/." /var/www/xn-platform/
    chown -R xnplatform:xnplatform "__DOLLAR__PROJECT_ROOT/backend" "__DOLLAR__PROJECT_ROOT/frontend"
    systemctl start "__DOLLAR__SERVICE_NAME"
    exit 1
fi

rm -rf "__DOLLAR__STAGE"
find /opt -maxdepth 1 -type d -name 'xn-platform-backup-*' -printf '%T@ %p\n' | sort -nr | tail -n +3 | cut -d' ' -f2- | xargs -r rm -rf
rm -f "/tmp/xn_ai_master_update.sh"
echo '[update] application update completed'
"@

    $RemoteCommand = $RemoteCommand.Replace("__DOLLAR__", "`$")
    $RemoteCommand = $RemoteCommand.Replace("`r`n", "`n")
    [System.IO.File]::WriteAllText($LocalScript, $RemoteCommand, [System.Text.UTF8Encoding]::new($false))
    & scp -P $Port $LocalScript "${Target}:$RemoteScript"
    if ($LASTEXITCODE -ne 0) {
        throw "Remote script upload failed. Exit code: $LASTEXITCODE"
    }
    & ssh -p $Port $Target "bash $RemoteScript"
    if ($LASTEXITCODE -ne 0) {
        throw "Remote update failed. Exit code: $LASTEXITCODE"
    }

    Write-Host "[update] Upload and update completed." -ForegroundColor Green
}
finally {
    if (Test-Path $ArchivePath) {
        Remove-Item -LiteralPath $ArchivePath -Force -ErrorAction SilentlyContinue
    }    if (Test-Path $LocalScript) {
        Remove-Item -LiteralPath $LocalScript -Force -ErrorAction SilentlyContinue
    }

}
