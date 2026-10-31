param(
    [Parameter(Mandatory = $true)]
    [string]$Server,
    [string]$User = "root",
    [string]$RemoteProject = "/opt/xn_ai_master",
    [int]$Port = 22
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ArchiveName = "xn_ai_master_deploy.tar.gz"
$ArchivePath = Join-Path $env:TEMP $ArchiveName
$RemoteArchive = "/tmp/$ArchiveName"
$Target = "$User@$Server"

function Write-Step([string]$Message) {
    Write-Host "[deploy] $Message" -ForegroundColor Cyan
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

    Write-Step "Creating project archive."
    if (Test-Path $ArchivePath) {
        Remove-Item -LiteralPath $ArchivePath -Force
    }

    # Upload only source code and deployment files; dependencies and caches are excluded.
    # 使用明确的工作目录和相对路径，兼容 Windows 内置 tar.exe。
    Push-Location $ProjectRoot
    try {
        & tar -czf $ArchivePath backend frontend build doc README.md .env.example .gitignore
    }
    finally {
        Pop-Location
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Archive creation failed. Exit code: $LASTEXITCODE"
    }

    Write-Step "Uploading project to $Target on port $Port."
    & scp -P $Port $ArchivePath "${Target}:$RemoteArchive"
    if ($LASTEXITCODE -ne 0) {
        throw "Upload failed. Exit code: $LASTEXITCODE"
    }

    Write-Step "Extracting project and starting remote deployment."
    $RemoteCommand = @"
set -e
mkdir -p '$RemoteProject'
rm -rf '$RemoteProject/backend' '$RemoteProject/frontend' '$RemoteProject/build' '$RemoteProject/doc'
tar -xzf '$RemoteArchive' -C '$RemoteProject'
chmod +x '$RemoteProject/build/install.sh'
bash '$RemoteProject/build/install.sh'
rm -f '$RemoteArchive'
"@
    & ssh -p $Port $Target $RemoteCommand
    if ($LASTEXITCODE -ne 0) {
        throw "Remote deployment failed. Exit code: $LASTEXITCODE"
    }

    Write-Host "[deploy] Upload and deployment completed." -ForegroundColor Green
}
finally {
    if (Test-Path $ArchivePath) {
        Remove-Item -LiteralPath $ArchivePath -Force -ErrorAction SilentlyContinue
    }
}
