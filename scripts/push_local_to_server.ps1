## Push local PostgreSQL database to remote server
# This script assumes you have pg_dump and psql available in your PATH.
# Adjust the variables below to match your environment.

# ------------------------------------------------------------
# Configuration – Edit these values
# ------------------------------------------------------------
# Local DB credentials (default from .env or environment)
$LocalHost = $env:DB_HOST      # e.g., "localhost"
$LocalPort = $env:DB_PORT      # e.g., "5432"
$LocalDb   = $env:DB_NAME      # e.g., "fellowship_db"
$LocalUser = $env:DB_USER      # e.g., "postgres"
$LocalPass = $env:DB_PASSWORD  # e.g., "postgres"

# Remote/server DB credentials – set these manually or via env
$RemoteHost = "your.remote.host"    # e.g., "db.example.com"
$RemotePort = "5432"
$RemoteDb   = "fellowship_db"
$RemoteUser = "remote_user"
$RemotePass = "remote_password"

# ------------------------------------------------------------
# Helper to build connection strings
# ------------------------------------------------------------
function Build-ConnString([string]$host, [string]$port, [string]$db, [string]$user, [string]$pwd) {
    return "postgresql://$user:$pwd@$host:$port/$db"
}

$localConn  = Build-ConnString $LocalHost $LocalPort $LocalDb $LocalUser $LocalPass
$remoteConn = Build-ConnString $RemoteHost $RemotePort $RemoteDb $RemoteUser $RemotePass

# ------------------------------------------------------------
# Step 1 – Dump local DB to a temporary file
# ------------------------------------------------------------
$dumpFile = Join-Path $env:TEMP "local_dump_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"
Write-Host "Dumping local DB to $dumpFile ..."
$dumpCmd = "pg_dump $localConn -Fc -f `"$dumpFile`""
Invoke-Expression $dumpCmd
if (-not (Test-Path $dumpFile)) {
    Write-Error "Failed to create dump file. Exiting."
    exit 1
}

# ------------------------------------------------------------
# Step 2 – Restore dump into remote DB
# ------------------------------------------------------------
Write-Host "Restoring dump into remote DB..."
$restoreCmd = "pg_restore --clean --no-owner --no-acl -d $remoteConn `"$dumpFile`""
Invoke-Expression $restoreCmd
if ($LASTEXITCODE -ne 0) {
    Write-Error "Restore failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

# ------------------------------------------------------------
# Cleanup
# ------------------------------------------------------------
Remove-Item $dumpFile -Force
Write-Host "Push completed successfully."
