# Database Migration Script (Local -> Server)
# Use this to sync your local data to your new server deployment.

$ErrorActionPreference = "Stop"

Write-Host "--- Fellowship Exam DB Migration ---" -ForegroundColor Cyan

# 1. Collect Server Info
$RemoteHost = Read-Host "Enter Server IP or Hostname"
$RemoteUser = Read-Host "Enter Server Database Username (default: postgres)"
if ([string]::IsNullOrWhiteSpace($RemoteUser)) { $RemoteUser = "postgres" }
$RemoteDb = Read-Host "Enter Server Database Name (default: sankara_fellowship)"
if ([string]::IsNullOrWhiteSpace($RemoteDb)) { $RemoteDb = "sankara_fellowship" }
$RemotePass = Read-Host "Enter Server Database Password" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($RemotePass)
$PlainPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

# 2. Local Config (Assume standard development settings)
$LocalConn = "postgresql://postgres:postgres@localhost:5432/fellowship_db" # Adjust if your local is different
$RemoteConn = "postgresql://${RemoteUser}:${PlainPass}@${RemoteHost}:5432/${RemoteDb}"

$DumpFile = "backup_to_push.sql"

try {
    # 3. Dump Local Data
    Write-Host "`n[1/3] Extracting local database..." -ForegroundColor Yellow
    & pg_dump "$LocalConn" -Fc -f $DumpFile
    
    # 4. Push to Server
    Write-Host "[2/3] Uploading and Restoring to Server ($RemoteHost)..." -ForegroundColor Yellow
    # Note: --clean removes existing tables to ensure a fresh match
    & pg_restore --clean --no-owner --no-acl -d "$RemoteConn" $DumpFile
    
    Write-Host "[3/3] Success! Database is now synced." -ForegroundColor Green
}
catch {
    Write-Host "`nError: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Make sure pg_dump and pg_restore are installed and the server allows connections." -ForegroundColor Red
}
finally {
    if (Test-Path $DumpFile) { Remove-Item $DumpFile }
}

Write-Host "`nNext Step: On your server, check your .env file and restart the API." -ForegroundColor Cyan
