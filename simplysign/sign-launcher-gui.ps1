<#
.SYNOPSIS
    GUI application for signing launcher.exe using Windows signtool

.DESCRIPTION
    This script provides a graphical user interface for code signing launcher.exe
    with Windows signtool and certificates from the Windows Certificate Store.
    Includes real-time progress display, comprehensive error logging, and visual status indicators.

.NOTES
    File Name      : sign-launcher-gui.ps1
    Prerequisite   : Windows SDK (signtool.exe) and certificate in Windows Certificate Store
    Copyright      : Pup Cid's Little TikTok Helper
    
.LINK
    https://www.certum.eu/en/cert_services_sign_code.html
#>

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Global variables
$script:logFilePath = Join-Path $PSScriptRoot "sign-launcher-error.log"
$script:launcherPath = Join-Path (Split-Path $PSScriptRoot -Parent) "launcher.exe"
$script:cloudLauncherPath = Join-Path (Split-Path $PSScriptRoot -Parent) "ltthgit.exe"
$script:timestampServer = "https://timestamp.digicert.com"
$script:signtoolExe = $null  # Will be auto-detected

# Logging function
function Write-Log {
    param(
        [string]$Message,
        [ValidateSet('INFO', 'WARNING', 'ERROR', 'SUCCESS')]
        [string]$Level = 'INFO'
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    
    # Write to log file
    Add-Content -Path $script:logFilePath -Value $logMessage
    
    # Return formatted message
    return $logMessage
}

# Initialize log file
function Initialize-Log {
    $separator = "=" * 80
    $header = @"
$separator
Certum Code Signing Tool - Error Log
Started: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
$separator
"@
    Set-Content -Path $script:logFilePath -Value $header
}

# Update status in GUI
function Update-Status {
    param(
        [string]$Message,
        [System.Drawing.Color]$Color = [System.Drawing.Color]::Black
    )
    
    $statusLabel.Text = $Message
    $statusLabel.ForeColor = $Color
    $form.Refresh()
}

# Update progress bar
function Update-Progress {
    param([int]$Value)
    $progressBar.Value = $Value
    $form.Refresh()
}

# Append to log display
function Append-LogDisplay {
    param(
        [string]$Message,
        [System.Drawing.Color]$Color = [System.Drawing.Color]::Black
    )
    
    $logTextBox.SelectionStart = $logTextBox.TextLength
    $logTextBox.SelectionLength = 0
    $logTextBox.SelectionColor = $Color
    $logTextBox.AppendText("$Message`r`n")
    $logTextBox.ScrollToCaret()
}

# Validation function
function Test-Prerequisites {
    $issues = @()
    
    # Check launcher.exe
    if (-not (Test-Path $script:launcherPath)) {
        $issues += "launcher.exe not found at: $script:launcherPath"
    }
    
    # Check SimplySign Desktop
    if (Test-Path $script:simplySignExe) {
        # Direct path exists
    } else {
        $simplySignPath = Get-Command "SimplySignDesktop.exe" -ErrorAction SilentlyContinue
        if (-not $simplySignPath) {
            $issues += "SimplySign Desktop not found at default path or in PATH"
        }
    }
    
    return $issues
}

# Main signing process
function Start-Signing {
    try {
        # Disable sign button during process
        $signButton.Enabled = $false
        $logTextBox.Clear()
        
        Initialize-Log
        Update-Progress 0
        
        # Determine which files to sign based on checkboxes
        $filesToSign = @()
        
        if ($script:launcherCheckbox.Checked -and (Test-Path $script:launcherPath)) {
            $filesToSign += @{Name = 'launcher.exe'; Path = $script:launcherPath}
        }
        
        if ($script:cloudCheckbox.Checked -and (Test-Path $script:cloudLauncherPath)) {
            $filesToSign += @{Name = 'ltthgit.exe'; Path = $script:cloudLauncherPath}
        }
        
        if ($filesToSign.Count -eq 0) {
            Append-LogDisplay "ERROR: No files selected or found to sign" -Color ([System.Drawing.Color]::Red)
            Append-LogDisplay "Please select at least one file to sign." -Color ([System.Drawing.Color]::Orange)
            
            [System.Windows.Forms.MessageBox]::Show(
                "No files selected or found to sign.`n`nPlease select at least one file.",
                "Error",
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Warning
            )
            return
        }
        
        # Step 1: Show files to sign
        Update-Status "Preparing to sign..." -Color ([System.Drawing.Color]::Blue)
        Append-LogDisplay "[1/5] Files to sign:" -Color ([System.Drawing.Color]::Blue)
        
        $logMsg = Write-Log "Starting signing process for $($filesToSign.Count) file(s)" "INFO"
        Append-LogDisplay $logMsg
        
        foreach ($file in $filesToSign) {
            $fullPath = Resolve-Path $file.Path
            Append-LogDisplay "      - $($file.Name): $fullPath" -Color ([System.Drawing.Color]::Cyan)
        }
        Append-LogDisplay ""
        
        Update-Progress 10
        Start-Sleep -Milliseconds 300
        
        # Step 2: Find signtool.exe
        Update-Status "Locating signtool.exe..." -Color ([System.Drawing.Color]::Blue)
        Append-LogDisplay "[2/5] Locating signtool.exe..." -Color ([System.Drawing.Color]::Blue)
        
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
                $script:signtoolExe = $matches.FullName
                $found = $true
                break
            }
        }
        
        if (-not $found) {
            # Try PATH as last resort
            $pathCmd = Get-Command "signtool.exe" -ErrorAction SilentlyContinue
            if ($pathCmd) {
                $script:signtoolExe = $pathCmd.Source
                $found = $true
            }
        }
        
        if (-not $found) {
            $logMsg = Write-Log "signtool.exe not found" "ERROR"
            Append-LogDisplay $logMsg -Color ([System.Drawing.Color]::Red)
            Append-LogDisplay "signtool.exe is part of the Windows SDK" -Color ([System.Drawing.Color]::Orange)
            Append-LogDisplay "Download from: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/" -Color ([System.Drawing.Color]::Orange)
            throw "signtool.exe not found"
        }
        
        $logMsg = Write-Log "Found signtool at: $script:signtoolExe" "INFO"
        Append-LogDisplay $logMsg -Color ([System.Drawing.Color]::Green)
        
        Append-LogDisplay ""
        Update-Progress 20
        Start-Sleep -Milliseconds 300
        
        # Step 3: Sign the files
        Update-Status "Signing files with signtool..." -Color ([System.Drawing.Color]::Blue)
        Append-LogDisplay "[3/5] Signing files with signtool..." -Color ([System.Drawing.Color]::Blue)
        Append-LogDisplay "Using certificate from Windows Certificate Store" -Color ([System.Drawing.Color]::Gray)
        Append-LogDisplay "Timestamp server: $script:timestampServer" -Color ([System.Drawing.Color]::Gray)
        Append-LogDisplay ""
        
        $signedCount = 0
        $failedCount = 0
        $signedFiles = @()
        $progressStep = 40 / $filesToSign.Count
        
        foreach ($file in $filesToSign) {
            $fullPath = Resolve-Path $file.Path
            Append-LogDisplay "   Signing $($file.Name)..." -Color ([System.Drawing.Color]::Cyan)
            
            $logMsg = Write-Log "Signing $($file.Name)" "INFO"
            
            # signtool sign /a /fd sha256 /tr <timestamp_url> /td sha256 <file>
            $signArguments = @(
                "sign",
                "/a",
                "/fd", "sha256",
                "/tr", $script:timestampServer,
                "/td", "sha256",
                "`"$fullPath`""
            )
            
            $tempOut = [System.IO.Path]::GetTempFileName()
            $tempErr = [System.IO.Path]::GetTempFileName()
            
            try {
                $signProcess = Start-Process -FilePath $script:signtoolExe `
                                             -ArgumentList $signArguments `
                                             -Wait `
                                             -PassThru `
                                             -NoNewWindow `
                                             -RedirectStandardOutput $tempOut `
                                             -RedirectStandardError $tempErr
                
                if ($signProcess.ExitCode -ne 0) {
                    $errorOutput = Get-Content $tempErr -Raw -ErrorAction SilentlyContinue
                    $logMsg = Write-Log "Failed to sign $($file.Name): Exit code $($signProcess.ExitCode)" "ERROR"
                    Append-LogDisplay "   ERROR: Failed to sign $($file.Name)" -Color ([System.Drawing.Color]::Red)
                    if ($errorOutput) {
                        Write-Log "Error details: $errorOutput" "ERROR"
                    }
                    $failedCount++
                }
                else {
                    $logMsg = Write-Log "Successfully signed $($file.Name)" "SUCCESS"
                    Append-LogDisplay "   SUCCESS: $($file.Name) signed" -Color ([System.Drawing.Color]::Green)
                    $signedCount++
                    $signedFiles += $file
                }
            }
            finally {
                if (Test-Path $tempOut) { Remove-Item $tempOut -Force -ErrorAction SilentlyContinue }
                if (Test-Path $tempErr) { Remove-Item $tempErr -Force -ErrorAction SilentlyContinue }
            }
            
            Append-LogDisplay ""
            Update-Progress (20 + ($signedCount + $failedCount) * $progressStep)
            Start-Sleep -Milliseconds 300
        }
        
        if ($failedCount -gt 0) {
            $logMsg = Write-Log "Signing failed for $failedCount file(s)" "ERROR"
            throw "Signing process failed for some files"
        }
        
        # Step 4: Verify signatures
        Update-Status "Verifying signatures..." -Color ([System.Drawing.Color]::Blue)
        Append-LogDisplay "[4/5] Verifying signatures..." -Color ([System.Drawing.Color]::Blue)
        Append-LogDisplay ""
        
        $signToolPath = Get-Command signtool.exe -ErrorAction SilentlyContinue
        $verifiedCount = 0
        
        if ($signToolPath) {
            foreach ($file in $signedFiles) {
                $fullPath = Resolve-Path $file.Path
                
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
                        $logMsg = Write-Log "$($file.Name) signature verification failed" "WARNING"
                        Append-LogDisplay "   WARNING: $($file.Name) verification failed" -Color ([System.Drawing.Color]::Orange)
                    }
                    else {
                        $logMsg = Write-Log "$($file.Name) signature verified successfully" "SUCCESS"
                        Append-LogDisplay "   SUCCESS: $($file.Name) verified" -Color ([System.Drawing.Color]::Green)
                        $verifiedCount++
                    }
                }
                finally {
                    if (Test-Path $tempOut) { Remove-Item $tempOut -Force -ErrorAction SilentlyContinue }
                    if (Test-Path $tempErr) { Remove-Item $tempErr -Force -ErrorAction SilentlyContinue }
                }
            }
        }
        else {
            $logMsg = Write-Log "signtool.exe not found - skipping verification" "WARNING"
            Append-LogDisplay "   Skipping verification (signtool.exe not found)" -Color ([System.Drawing.Color]::Orange)
        }
        
        Append-LogDisplay ""
        Update-Progress 80
        Start-Sleep -Milliseconds 300
        
        # Step 5: Summary
        Update-Status "Completed!" -Color ([System.Drawing.Color]::Green)
        Append-LogDisplay "[5/5] Summary" -Color ([System.Drawing.Color]::Blue)
        Append-LogDisplay "   Files signed: $signedCount" -Color ([System.Drawing.Color]::Green)
        Append-LogDisplay "   Files verified: $verifiedCount" -Color ([System.Drawing.Color]::Green)
        Append-LogDisplay ""
        
        Update-Progress 100
        
        $logMsg = Write-Log "Signing process completed successfully" "SUCCESS"
        Append-LogDisplay "════════════════════════════════════════════════════════" -Color ([System.Drawing.Color]::Green)
        Append-LogDisplay "SUCCESS: $signedCount file(s) signed!" -Color ([System.Drawing.Color]::Green)
        Append-LogDisplay "════════════════════════════════════════════════════════" -Color ([System.Drawing.Color]::Green)
        
        [System.Windows.Forms.MessageBox]::Show(
            "Successfully signed $signedCount file(s)!`n`nThe signed executable(s) are ready for distribution.",
            "Success",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information
        )
    }
    catch {
        Update-Progress 0
        Update-Status "ERROR: Signing failed!" -Color ([System.Drawing.Color]::Red)
        
        $logMsg = Write-Log "Signing process failed: $($_.Exception.Message)" "ERROR"
        Append-LogDisplay ""
        Append-LogDisplay "════════════════════════════════════════════════════════" -Color ([System.Drawing.Color]::Red)
        Append-LogDisplay "FAILED: Signing process failed" -Color ([System.Drawing.Color]::Red)
        Append-LogDisplay "════════════════════════════════════════════════════════" -Color ([System.Drawing.Color]::Red)
        Append-LogDisplay "Error: $($_.Exception.Message)" -Color ([System.Drawing.Color]::Red)
        
        [System.Windows.Forms.MessageBox]::Show(
            "Signing failed!`n`nError: $($_.Exception.Message)`n`nPlease check the error log for details.",
            "Error",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        )
    }
    finally {
        $signButton.Enabled = $true
    }
}

# Open error log
function Open-ErrorLog {
    if (Test-Path $script:logFilePath) {
        Start-Process notepad.exe -ArgumentList $script:logFilePath
    }
    else {
        [System.Windows.Forms.MessageBox]::Show(
            "Error log file not found.`n`nThe log will be created when you run the signing process.",
            "Information",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information
        )
    }
}

# Create the form
$form = New-Object System.Windows.Forms.Form
$form.Text = "Certum Code Signing Tool (signtool)"
$form.Size = New-Object System.Drawing.Size(700, 650)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $true

# Header label
$headerLabel = New-Object System.Windows.Forms.Label
$headerLabel.Location = New-Object System.Drawing.Point(10, 10)
$headerLabel.Size = New-Object System.Drawing.Size(660, 30)
$headerLabel.Text = "Certum Code Signing Tool (Windows signtool)"
$headerLabel.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$headerLabel.ForeColor = [System.Drawing.Color]::DarkBlue
$form.Controls.Add($headerLabel)

# File selection panel
$filePanel = New-Object System.Windows.Forms.GroupBox
$filePanel.Location = New-Object System.Drawing.Point(10, 50)
$filePanel.Size = New-Object System.Drawing.Size(660, 80)
$filePanel.Text = "Files to Sign"
$form.Controls.Add($filePanel)

# Launcher checkbox
$script:launcherCheckbox = New-Object System.Windows.Forms.CheckBox
$script:launcherCheckbox.Location = New-Object System.Drawing.Point(10, 25)
$script:launcherCheckbox.Size = New-Object System.Drawing.Size(640, 20)
$script:launcherCheckbox.Text = "launcher.exe"
$script:launcherCheckbox.Checked = $true
if (Test-Path $script:launcherPath) {
    $script:launcherCheckbox.Text = "launcher.exe (Found)"
    $script:launcherCheckbox.ForeColor = [System.Drawing.Color]::Green
} else {
    $script:launcherCheckbox.Text = "launcher.exe (Not Found)"
    $script:launcherCheckbox.ForeColor = [System.Drawing.Color]::Red
    $script:launcherCheckbox.Checked = $false
    $script:launcherCheckbox.Enabled = $false
}
$filePanel.Controls.Add($script:launcherCheckbox)

# Cloud launcher checkbox
$script:cloudCheckbox = New-Object System.Windows.Forms.CheckBox
$script:cloudCheckbox.Location = New-Object System.Drawing.Point(10, 50)
$script:cloudCheckbox.Size = New-Object System.Drawing.Size(640, 20)
$script:cloudCheckbox.Text = "ltthgit.exe"
$script:cloudCheckbox.Checked = $true
if (Test-Path $script:cloudLauncherPath) {
    $script:cloudCheckbox.Text = "ltthgit.exe (Found)"
    $script:cloudCheckbox.ForeColor = [System.Drawing.Color]::Green
} else {
    $script:cloudCheckbox.Text = "ltthgit.exe (Not Found)"
    $script:cloudCheckbox.ForeColor = [System.Drawing.Color]::Orange
    $script:cloudCheckbox.Checked = $false
}
$filePanel.Controls.Add($script:cloudCheckbox)

# Info panel
$infoPanel = New-Object System.Windows.Forms.GroupBox
$infoPanel.Location = New-Object System.Drawing.Point(10, 140)
$infoPanel.Size = New-Object System.Drawing.Size(660, 70)
$infoPanel.Text = "Configuration"
$form.Controls.Add($infoPanel)

# Timestamp server label
$timestampLabel = New-Object System.Windows.Forms.Label
$timestampLabel.Location = New-Object System.Drawing.Point(10, 25)
$timestampLabel.Size = New-Object System.Drawing.Size(640, 20)
$timestampLabel.Text = "Timestamp Server: $script:timestampServer"
$infoPanel.Controls.Add($timestampLabel)

# SimplySign label
$signtoolLabel = New-Object System.Windows.Forms.Label
$signtoolLabel.Location = New-Object System.Drawing.Point(10, 45)
$signtoolLabel.Size = New-Object System.Drawing.Size(640, 20)
$signtoolLabel.Text = "Signing Tool: Windows signtool.exe (auto-detected)"
$infoPanel.Controls.Add($signtoolLabel)

# Progress bar
$progressBar = New-Object System.Windows.Forms.ProgressBar
$progressBar.Location = New-Object System.Drawing.Point(10, 220)
$progressBar.Size = New-Object System.Drawing.Size(660, 25)
$progressBar.Minimum = 0
$progressBar.Maximum = 100
$progressBar.Value = 0
$form.Controls.Add($progressBar)

# Status label
$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Location = New-Object System.Drawing.Point(10, 255)
$statusLabel.Size = New-Object System.Drawing.Size(660, 20)
$statusLabel.Text = "Ready to sign"
$statusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($statusLabel)

# Log text box
$logTextBox = New-Object System.Windows.Forms.RichTextBox
$logTextBox.Location = New-Object System.Drawing.Point(10, 285)
$logTextBox.Size = New-Object System.Drawing.Size(660, 260)
$logTextBox.Font = New-Object System.Drawing.Font("Consolas", 9)
$logTextBox.ReadOnly = $true
$logTextBox.BackColor = [System.Drawing.Color]::White
$logTextBox.BorderStyle = "FixedSingle"
$form.Controls.Add($logTextBox)

# Button panel
$buttonPanel = New-Object System.Windows.Forms.Panel
$buttonPanel.Location = New-Object System.Drawing.Point(10, 555)
$buttonPanel.Size = New-Object System.Drawing.Size(660, 50)
$form.Controls.Add($buttonPanel)

# Sign button
$signButton = New-Object System.Windows.Forms.Button
$signButton.Location = New-Object System.Drawing.Point(0, 10)
$signButton.Size = New-Object System.Drawing.Size(200, 35)
$signButton.Text = "Sign Launcher"
$signButton.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$signButton.BackColor = [System.Drawing.Color]::FromArgb(0, 120, 215)
$signButton.ForeColor = [System.Drawing.Color]::White
$signButton.FlatStyle = "Flat"
$signButton.Add_Click({ Start-Signing })
$buttonPanel.Controls.Add($signButton)

# View log button
$viewLogButton = New-Object System.Windows.Forms.Button
$viewLogButton.Location = New-Object System.Drawing.Point(220, 10)
$viewLogButton.Size = New-Object System.Drawing.Size(200, 35)
$viewLogButton.Text = "View Error Log"
$viewLogButton.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$viewLogButton.Add_Click({ Open-ErrorLog })
$buttonPanel.Controls.Add($viewLogButton)

# Close button
$closeButton = New-Object System.Windows.Forms.Button
$closeButton.Location = New-Object System.Drawing.Point(440, 10)
$closeButton.Size = New-Object System.Drawing.Size(200, 35)
$closeButton.Text = "Close"
$closeButton.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$closeButton.Add_Click({ $form.Close() })
$buttonPanel.Controls.Add($closeButton)

# Show the form
$form.Add_Shown({
    $logTextBox.AppendText("Certum Code Signing Tool`r`n")
    $logTextBox.AppendText("═══════════════════════════════════════════════════════`r`n")
    $logTextBox.AppendText("`r`n")
    $logTextBox.AppendText("Ready to sign launcher.exe`r`n")
    $logTextBox.AppendText("Click 'Sign Launcher' to begin the signing process.`r`n")
    $logTextBox.AppendText("`r`n")
    $logTextBox.AppendText("Error log will be saved to:`r`n")
    $logTextBox.AppendText("$script:logFilePath`r`n")
})

[void]$form.ShowDialog()
