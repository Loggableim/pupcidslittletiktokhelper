<#
.SYNOPSIS
    Signs launcher executables using SimplySign(TM) Desktop tool

.DESCRIPTION
    This script automates the code signing process for launcher executables using
    SimplySign Desktop. It includes validation, error handling, and detailed
    status reporting. Supports signing multiple files.

.PARAMETER Files
    Files to sign: 'all', 'launcher', 'cloud', or array of file paths
    (default: 'all' - signs both launcher.exe and ltthgit.exe)

.PARAMETER LauncherPath
    Path to launcher.exe (default: ..\launcher.exe)

.PARAMETER CloudLauncherPath
    Path to ltthgit.exe (default: ..\ltthgit.exe)

.PARAMETER TimestampServer
    URL of the timestamp server (default: https://timestamp.digicert.com)

.PARAMETER SimplySignExe
    Name or path to SimplySign Desktop executable (default: SimplySignDesktop.exe)

.EXAMPLE
    .\sign-launcher.ps1
    Signs both launcher.exe and ltthgit.exe with default settings

.EXAMPLE
    .\sign-launcher.ps1 -Files launcher
    Signs only launcher.exe

.EXAMPLE
    .\sign-launcher.ps1 -Files cloud
    Signs only ltthgit.exe

.EXAMPLE
    .\sign-launcher.ps1 -LauncherPath "C:\path\to\launcher.exe" -Files launcher
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
    [ValidateSet('all', 'launcher', 'cloud')]
    [string]$Files = 'all',
    
    [Parameter(Mandatory = $false)]
    [string]$LauncherPath = "..\launcher.exe",
    
    [Parameter(Mandatory = $false)]
    [string]$CloudLauncherPath = "..\ltthgit.exe",
    
    [Parameter(Mandatory = $false)]
    [string]$TimestampServer = "https://timestamp.digicert.com",
    
    [Parameter(Mandatory = $false)]
    [string]$SimplySignExe = "C:\Program Files\Certum\SimplySign Desktop\SimplySignDesktop.exe"
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
    Write-SectionHeader "SimplySign(TM) Launcher Signing Tool"
    
    # Determine which files to sign
    $filesToSign = @()
    
    switch ($Files) {
        'all' {
            if (Test-Path $LauncherPath) {
                $filesToSign += @{Name = 'launcher.exe'; Path = $LauncherPath}
            }
            if (Test-Path $CloudLauncherPath) {
                $filesToSign += @{Name = 'ltthgit.exe'; Path = $CloudLauncherPath}
            }
        }
        'launcher' {
            if (Test-Path $LauncherPath) {
                $filesToSign += @{Name = 'launcher.exe'; Path = $LauncherPath}
            }
        }
        'cloud' {
            if (Test-Path $CloudLauncherPath) {
                $filesToSign += @{Name = 'ltthgit.exe'; Path = $CloudLauncherPath}
            }
        }
    }
    
    if ($filesToSign.Count -eq 0) {
        Write-Status "ERROR: No files found to sign" -Type Error
        Write-Host ""
        Write-Status "Expected files:" -Type Warning
        if ($Files -eq 'all' -or $Files -eq 'launcher') {
            Write-Host "  - $LauncherPath"
        }
        if ($Files -eq 'all' -or $Files -eq 'cloud') {
            Write-Host "  - $CloudLauncherPath"
        }
        throw "No files found"
    }
    
    Write-Status "Mode: $Files" -Type Info
    Write-Status "Files to sign: $($filesToSign.Count)" -Type Info
    Write-Host ""
    
    # Step 1: Check if SimplySign Desktop is installed
    Write-Status "[1/5] Checking for SimplySign Desktop..." -Type Info
    
    # Try default Certum path first
    if (Test-Path $SimplySignExe) {
        $simplySignPath = $SimplySignExe
        Write-Status "      Found: $simplySignPath" -Type Success
    } else {
        # Fall back to PATH
        $pathCmd = Get-Command "SimplySignDesktop.exe" -ErrorAction SilentlyContinue
        if ($pathCmd) {
            $simplySignPath = $pathCmd.Source
            Write-Status "      Found in PATH: $simplySignPath" -Type Success
        } else {
            Write-Status "      ERROR: SimplySign Desktop not found at default path or in PATH" -Type Error
            Write-Host ""
            Write-Status "      Expected at: $SimplySignExe" -Type Warning
            Write-Host ""
            Write-Status "      Please install SimplySign Desktop from:" -Type Warning
            Write-Host "      https://www.certum.eu/en/cert_services_sign_code.html"
            Write-Host ""
            Write-Status "      After installation, ensure SimplySignDesktop.exe is accessible" -Type Warning
            Write-Status "      or update the -SimplySignExe parameter." -Type Warning
            throw "SimplySign Desktop not found"
        }
    }
    
    Write-Host ""
    
    # Step 2: List files to sign
    Write-Status "[2/5] Files to sign:" -Type Info
    foreach ($file in $filesToSign) {
        $fullPath = Resolve-Path $file.Path
        Write-Status "      - $($file.Name): $fullPath" -Type Info
    }
    Write-Host ""
    
    # Step 3: Sign the files
    Write-Status "[3/5] Signing files..." -Type Info
    Write-Host ""
    
    $signedCount = 0
    $failedCount = 0
    
    foreach ($file in $filesToSign) {
        $fullPath = Resolve-Path $file.Path
        Write-Status "   Signing $($file.Name)..." -Type Info
        
        $signArguments = @(
            "sign",
            "/file:`"$fullPath`"",
            "/timestamp:`"$TimestampServer`""
        )
        
        $signProcess = Start-Process -FilePath $simplySignPath `
                                     -ArgumentList $signArguments `
                                     -Wait `
                                     -PassThru `
                                     -NoNewWindow
        
        if ($signProcess.ExitCode -ne 0) {
            Write-Status "   ERROR: Failed to sign $($file.Name)" -Type Error
            $failedCount++
        }
        else {
            Write-Status "   SUCCESS: $($file.Name) signed" -Type Success
            $signedCount++
        }
        Write-Host ""
    }
    
    if ($failedCount -gt 0) {
        Write-Host ""
        Write-Status "ERROR: Signing failed for $failedCount file(s)" -Type Error
        Write-Host ""
        Write-Status "Common issues:" -Type Warning
        Write-Host "  - No valid certificate configured in SimplySign Desktop"
        Write-Host "  - Certificate expired or not yet valid"
        Write-Host "  - Network issue accessing timestamp server"
        Write-Host "  - File is locked or in use"
        Write-Host ""
        Write-Status "Please check SimplySign Desktop for details." -Type Warning
        throw "Signing process failed"
    }
    
    # Step 4: Verify signatures
    Write-Status "[4/5] Verifying signatures..." -Type Info
    Write-Host ""
    
    $signToolPath = Get-Command signtool.exe -ErrorAction SilentlyContinue
    $verifiedCount = 0
    
    if ($signToolPath) {
        foreach ($file in $filesToSign) {
            $fullPath = Resolve-Path $file.Path
            
            # Create temporary files for output redirection
            $tempOut = [System.IO.Path]::GetTempFileName()
            $tempErr = [System.IO.Path]::GetTempFileName()
            
            try {
                $verifyProcess = Start-Process -FilePath $signToolPath.Source `
                                               -ArgumentList @("verify", "/pa", "`"$fullPath`"") `
                                               -Wait `
                                               -PassThru `
                                               -NoNewWindow `
                                               -RedirectStandardOutput $tempOut `
                                               -RedirectStandardError $tempErr
                
                if ($verifyProcess.ExitCode -ne 0) {
                    Write-Status "   WARNING: $($file.Name) signature verification failed" -Type Warning
                }
                else {
                    Write-Status "   SUCCESS: $($file.Name) signature verified" -Type Success
                    $verifiedCount++
                }
            }
            finally {
                # Clean up temporary files
                if (Test-Path $tempOut) { Remove-Item $tempOut -Force -ErrorAction SilentlyContinue }
                if (Test-Path $tempErr) { Remove-Item $tempErr -Force -ErrorAction SilentlyContinue }
            }
        }
    }
    else {
        Write-Status "   Skipping verification (signtool.exe not found)" -Type Warning
    }
    
    Write-Host ""
    
    # Step 5: Summary
    Write-Status "[5/5] Summary" -Type Info
    Write-Status "   Files signed: $signedCount" -Type Success
    Write-Status "   Files verified: $verifiedCount" -Type Success
    Write-Host ""
    
    Write-SectionHeader "SUCCESS: Signing completed!"
    Write-Host ""
    Write-Status "Signed $signedCount file(s) successfully." -Type Success
    Write-Status "The signed executable(s) are ready for distribution." -Type Success
    Write-Status "Users will see a verified publisher when running the executable(s)." -Type Success
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
