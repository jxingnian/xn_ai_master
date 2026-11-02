param(
    [Parameter(Mandatory = $true)]
    [string]$Server,
    [string]$User = "root",
    [int]$Port = 22,
    [string]$PublicIp = "111.228.3.219",
    [string]$PrivateIp = "172.16.0.5",
    [int]$RelayMinPort = 49152,
    [int]$RelayMaxPort = 65535
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    throw "ssh command was not found."
}
if ($RelayMinPort -lt 1024 -or $RelayMaxPort -gt 65535 -or $RelayMinPort -ge $RelayMaxPort) {
    throw "Invalid relay port range."
}

# The public/private address pair is required when the cloud host is behind NAT.
# Without it, relay candidates point to the wrong address and ICE disconnects.
$remoteScript = @"
set -euo pipefail
CONFIG=/etc/turnserver.conf
TMP=\$(mktemp)
awk '!/^(external-ip|min-port|max-port)=/ && !/^lt-cred-mech$/ && !/^no-loopback-peers$/ && !/^no-multicast-peers$/' "\$CONFIG" > "\$TMP"
cat >> "\$TMP" <<'EOF'
external-ip=$PublicIp/$PrivateIp
min-port=$RelayMinPort
max-port=$RelayMaxPort
EOF
install -o root -g turnserver -m 0640 "\$TMP" "\$CONFIG"
rm -f "\$TMP"

# Ensure the coturn user can write diagnostics instead of silently losing logs.
install -d -o turnserver -g turnserver -m 0750 /var/log/turnserver
touch /var/log/turnserver/turnserver.log
chown turnserver:turnserver /var/log/turnserver/turnserver.log
chmod 0640 /var/log/turnserver/turnserver.log

systemctl restart coturn
systemctl is-active --quiet coturn
grep -E '^(external-ip|min-port|max-port)=' "\$CONFIG"
ss -lunpt | grep ':3478' || true
"@

$target = "$User@$Server"
& ssh -p $Port $target ($remoteScript -replace "`r`n", "`n")
if ($LASTEXITCODE -ne 0) {
    throw "Remote coturn configuration failed, exit code: $LASTEXITCODE"
}

Write-Host "coturn configuration persisted and service restarted." -ForegroundColor Green
