<#
.SYNOPSIS
    Signs launcher executables using Windows signtool with Certum certificate

.DESCRIPTION
    This script automates the code signing process for launcher executables using
    Windows signtool.exe and a certificate from the Windows Certificate Store.
    For Certum SimplySign, ensure the certificate is installed in the store first.

.PARAMETER Files
    Files to sign: 'all', 'launcher', 'cloud', or array of file paths
    (default: 'all' - signs both launcher.exe and ltthgit.exe)

.PARAMETER LauncherPath
    Path to launcher.exe (default: ..\launcher.exe)

.PARAMETER CloudLauncherPath
    Path to ltthgit.exe (default: ..\ltthgit.exe)

.PARAMETER TimestampServer
    URL of the timestamp server (default: https://timestamp.digicert.com)

.PARAMETER SigntoolPath
    Path to signtool.exe (default: searches Windows SDK locations)

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
    Prerequisite   : Windows SDK (signtool.exe) and Certum certificate in Windows Certificate Store
    Copyright      : Pup Cid's Little TikTok Helper
    
.LINK
    https://www.certum.eu/en/cert_services_sign_code.html
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
    [string]$SigntoolPath = $null
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
    
    # Step 1: Find signtool.exe
    Write-Status "[1/5] Locating signtool.exe..." -Type Info
    
    if ($SigntoolPath -and (Test-Path $SigntoolPath)) {
        $signtoolExe = $SigntoolPath
        Write-Status "      Using custom path: $signtoolExe" -Type Success
    } else {
        # Search for signtool in common Windows SDK locations
        $sdkPaths = @(
            "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe",
            "${env:ProgramFiles(x86)}\Windows Kits\10\bin\x64\signtool.exe",
            "${env:ProgramFiles}\Windows Kits\10\bin\*\x64\signtool.exe",
            "${env:ProgramFiles}\Windows Kits\10\bin\x64\signtool.exe"
        )
        
        $found = $false
        foreach ($pattern in $sdkPaths) {
            $matches = Get-ChildItem $pattern -ErrorAction SilentlyContinue | Sort-Object -Descending | Select-Object -First 1
            if ($matches) {
                $signtoolExe = $matches.FullName
                $found = $true
                break
            }
        }
        
        if (-not $found) {
            # Try PATH as last resort
            $pathCmd = Get-Command "signtool.exe" -ErrorAction SilentlyContinue
            if ($pathCmd) {
                $signtoolExe = $pathCmd.Source
                $found = $true
            }
        }
        
        if (-not $found) {
            Write-Status "      ERROR: signtool.exe not found" -Type Error
            Write-Host ""
            Write-Status "      signtool.exe is part of the Windows SDK" -Type Warning
            Write-Host "      Download from: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/"
            Write-Host ""
            throw "signtool.exe not found"
        }
        
        Write-Status "      Found: $signtoolExe" -Type Success
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
    Write-Status "[3/5] Signing files with signtool..." -Type Info
    Write-Status "   Using certificate from Windows Certificate Store" -Type Info
    Write-Host ""
    
    $signedCount = 0
    $failedCount = 0
    
    foreach ($file in $filesToSign) {
        $fullPath = Resolve-Path $file.Path
        Write-Status "   Signing $($file.Name)..." -Type Info
        
        # signtool sign /a /fd sha256 /tr <timestamp_url> /td sha256 <file>
        # /a = automatically select best certificate
        # /fd sha256 = file digest algorithm
        # /tr = RFC 3161 timestamp server
        # /td sha256 = timestamp digest algorithm
        $signArguments = @(
            "sign",
            "/a",
            "/fd", "sha256",
            "/tr", $TimestampServer,
            "/td", "sha256",
            "`"$fullPath`""
        )
        
        $signProcess = Start-Process -FilePath $signtoolExe `
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
        Write-Host "  - No valid certificate in Windows Certificate Store"
        Write-Host "  - Certificate expired or not yet valid"
        Write-Host "  - Network issue accessing timestamp server"
        Write-Host "  - File is locked or in use"
        Write-Host ""
        Write-Status "For Certum SimplySign: Ensure certificate is installed in Windows Certificate Store" -Type Warning
        throw "Signing process failed"
    }
    
    # Step 4: Verify signatures
    Write-Status "[4/5] Verifying signatures..." -Type Info
    Write-Host ""
    
    $verifiedCount = 0
    
    foreach ($file in $filesToSign) {
        $fullPath = Resolve-Path $file.Path
        
        # Create temporary files for output redirection
        $tempOut = [System.IO.Path]::GetTempFileName()
        $tempErr = [System.IO.Path]::GetTempFileName()
        
        try {
            $verifyProcess = Start-Process -FilePath $signtoolExe `
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
