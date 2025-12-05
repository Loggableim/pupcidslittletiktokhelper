<#
.SYNOPSIS
    Signs launcher.exe using SimplySign™ Desktop tool

.DESCRIPTION
    This script automates the code signing process for launcher.exe using
    SimplySign Desktop. It includes validation, error handling, and detailed
    status reporting.

.PARAMETER LauncherPath
    Path to launcher.exe (default: ..\launcher.exe)

.PARAMETER TimestampServer
    URL of the timestamp server (default: http://timestamp.digicert.com)

.PARAMETER SimplySignExe
    Name or path to SimplySign Desktop executable (default: SimplySignDesktop.exe)

.EXAMPLE
    .\sign-launcher.ps1
    Signs launcher.exe with default settings

.EXAMPLE
    .\sign-launcher.ps1 -LauncherPath "C:\path\to\launcher.exe"
    Signs launcher.exe at a custom path

.NOTES
    File Name      : sign-launcher.ps1
    Prerequisite   : SimplySign Desktop must be installed
    Copyright      : Pup Cid's Little TikTok Helper
    
.LINK
    https://www.simplysign.eu/en/desktop
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$LauncherPath = "..\launcher.exe",
    
    [Parameter(Mandatory = $false)]
    [string]$TimestampServer = "http://timestamp.digicert.com",
    
    [Parameter(Mandatory = $false)]
    [string]$SimplySignExe = "SimplySignDesktop.exe"
)

# Set error action preference
$ErrorActionPreference = "Stop"

# Function to write colored output
function Write-Status {
    param(
        [string]$Message,
        [ValidateSet('Info', 'Success', 'Warning', 'Error')]
        [string]$Type = 'Info'
    )
    
    $color = switch ($Type) {
        'Info'    { 'Cyan' }
        'Success' { 'Green' }
        'Warning' { 'Yellow' }
        'Error'   { 'Red' }
    }
    
    Write-Host $Message -ForegroundColor $color
}

# Function to write section header
function Write-SectionHeader {
    param([string]$Title)
    
    Write-Host ""
    Write-Host ("=" * 80) -ForegroundColor Gray
    Write-Host "  $Title" -ForegroundColor White
    Write-Host ("=" * 80) -ForegroundColor Gray
    Write-Host ""
}

# Main script
try {
    Write-SectionHeader "SimplySign™ Launcher Signing Tool"
    
    # Step 1: Validate launcher.exe exists
    Write-Status "[1/4] Checking for launcher.exe..." -Type Info
    
    if (-not (Test-Path $LauncherPath)) {
        Write-Status "      ERROR: launcher.exe not found at $LauncherPath" -Type Error
        Write-Status "      Please ensure launcher.exe exists in the parent directory." -Type Error
        throw "Launcher file not found"
    }
    
    $launcherFullPath = Resolve-Path $LauncherPath
    Write-Status "      Found: $launcherFullPath" -Type Success
    Write-Host ""
    
    # Step 2: Check if SimplySign Desktop is installed
    Write-Status "[2/4] Checking for SimplySign Desktop..." -Type Info
    
    $simplySignPath = Get-Command $SimplySignExe -ErrorAction SilentlyContinue
    
    if (-not $simplySignPath) {
        Write-Status "      ERROR: SimplySign Desktop not found in PATH" -Type Error
        Write-Host ""
        Write-Status "      Please install SimplySign Desktop from:" -Type Warning
        Write-Host "      https://www.simplysign.eu/en/desktop"
        Write-Host ""
        Write-Status "      After installation, ensure SimplySignDesktop.exe is in your PATH" -Type Warning
        Write-Status "      or update the -SimplySignExe parameter." -Type Warning
        throw "SimplySign Desktop not found"
    }
    
    Write-Status "      Found: $($simplySignPath.Source)" -Type Success
    Write-Host ""
    
    # Step 3: Sign the launcher
    Write-Status "[3/4] Signing launcher.exe..." -Type Info
    Write-Status "      This may take a moment..." -Type Info
    Write-Host ""
    
    $signArguments = @(
        "sign",
        "/file:`"$launcherFullPath`"",
        "/timestamp:`"$TimestampServer`""
    )
    
    $signProcess = Start-Process -FilePath $simplySignPath.Source `
                                 -ArgumentList $signArguments `
                                 -Wait `
                                 -PassThru `
                                 -NoNewWindow
    
    if ($signProcess.ExitCode -ne 0) {
        Write-Host ""
        Write-Status "      ERROR: Signing failed with exit code $($signProcess.ExitCode)" -Type Error
        Write-Host ""
        Write-Status "      Common issues:" -Type Warning
        Write-Host "        - No valid certificate configured in SimplySign Desktop"
        Write-Host "        - Certificate expired or not yet valid"
        Write-Host "        - Network issue accessing timestamp server"
        Write-Host "        - File is locked or in use"
        Write-Host ""
        Write-Status "      Please check SimplySign Desktop for details." -Type Warning
        throw "Signing process failed"
    }
    
    Write-Host ""
    
    # Step 4: Verify signature
    Write-Status "[4/4] Verifying signature..." -Type Info
    
    $signToolPath = Get-Command signtool.exe -ErrorAction SilentlyContinue
    
    if ($signToolPath) {
        $verifyProcess = Start-Process -FilePath $signToolPath.Source `
                                       -ArgumentList @("verify", "/pa", "`"$launcherFullPath`"") `
                                       -Wait `
                                       -PassThru `
                                       -NoNewWindow `
                                       -RedirectStandardOutput "nul" `
                                       -RedirectStandardError "nul"
        
        if ($verifyProcess.ExitCode -ne 0) {
            Write-Status "      WARNING: Signature verification failed" -Type Warning
            Write-Status "      The file was signed but signature may be invalid" -Type Warning
            throw "Signature verification failed"
        }
        
        Write-Status "      Signature verified successfully!" -Type Success
    }
    else {
        Write-Status "      Skipping verification (signtool.exe not found)" -Type Warning
    }
    
    Write-Host ""
    Write-SectionHeader "SUCCESS: launcher.exe has been signed!"
    Write-Host ""
    Write-Status "The signed launcher.exe is ready for distribution." -Type Success
    Write-Status "Users will see a verified publisher when running the executable." -Type Success
    Write-Host ""
    
    exit 0
}
catch {
    Write-Host ""
    Write-SectionHeader "FAILED: Signing process failed"
    Write-Host ""
    Write-Status "Error: $($_.Exception.Message)" -Type Error
    Write-Host ""
    Write-Status "Please review the error messages above and try again." -Type Warning
    Write-Status "For help, see README.md in this directory." -Type Info
    Write-Host ""
    
    exit 1
}
