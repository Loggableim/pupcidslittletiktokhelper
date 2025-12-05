<#
.SYNOPSIS
    GUI application for signing launcher.exe using SimplySign™ Desktop

.DESCRIPTION
    This script provides a graphical user interface for code signing launcher.exe
    with SimplySign Desktop. Includes real-time progress display, comprehensive
    error logging, and visual status indicators.

.NOTES
    File Name      : sign-launcher-gui.ps1
    Prerequisite   : SimplySign Desktop must be installed
    Copyright      : Pup Cid's Little TikTok Helper
    
.LINK
    https://www.simplysign.eu/en/desktop
#>

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Global variables
$script:logFilePath = Join-Path $PSScriptRoot "sign-launcher-error.log"
$script:launcherPath = Join-Path (Split-Path $PSScriptRoot -Parent) "launcher.exe"
$script:timestampServer = "https://timestamp.digicert.com"
$script:simplySignExe = "SimplySignDesktop.exe"

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
SimplySign™ Launcher Signing Tool - Error Log
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
    $simplySignPath = Get-Command $script:simplySignExe -ErrorAction SilentlyContinue
    if (-not $simplySignPath) {
        $issues += "SimplySign Desktop not found in PATH"
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
        
        # Step 1: Validate prerequisites
        Update-Status "Checking prerequisites..." -Color ([System.Drawing.Color]::Blue)
        Append-LogDisplay "[1/4] Checking prerequisites..." -Color ([System.Drawing.Color]::Blue)
        
        $logMsg = Write-Log "Starting signing process" "INFO"
        Append-LogDisplay $logMsg
        
        $issues = Test-Prerequisites
        if ($issues.Count -gt 0) {
            foreach ($issue in $issues) {
                $logMsg = Write-Log $issue "ERROR"
                Append-LogDisplay $logMsg -Color ([System.Drawing.Color]::Red)
            }
            throw "Prerequisite validation failed"
        }
        
        $logMsg = Write-Log "Prerequisites validated successfully" "SUCCESS"
        Append-LogDisplay $logMsg -Color ([System.Drawing.Color]::Green)
        Update-Progress 25
        Start-Sleep -Milliseconds 500
        
        # Step 2: Locate SimplySign Desktop
        Update-Status "Locating SimplySign Desktop..." -Color ([System.Drawing.Color]::Blue)
        Append-LogDisplay "[2/4] Locating SimplySign Desktop..." -Color ([System.Drawing.Color]::Blue)
        
        $simplySignPath = Get-Command $script:simplySignExe -ErrorAction Stop
        $logMsg = Write-Log "Found SimplySign Desktop at: $($simplySignPath.Source)" "INFO"
        Append-LogDisplay $logMsg
        Update-Progress 40
        Start-Sleep -Milliseconds 500
        
        # Step 3: Sign the file
        Update-Status "Signing launcher.exe..." -Color ([System.Drawing.Color]::Blue)
        Append-LogDisplay "[3/4] Signing launcher.exe..." -Color ([System.Drawing.Color]::Blue)
        Append-LogDisplay "This may take a moment..." -Color ([System.Drawing.Color]::Gray)
        
        $logMsg = Write-Log "Timestamp server: $script:timestampServer" "INFO"
        Append-LogDisplay $logMsg
        
        $signArguments = @(
            "sign",
            "/file:`"$script:launcherPath`"",
            "/timestamp:`"$script:timestampServer`""
        )
        
        $tempOut = [System.IO.Path]::GetTempFileName()
        $tempErr = [System.IO.Path]::GetTempFileName()
        
        try {
            $signProcess = Start-Process -FilePath $simplySignPath.Source `
                                         -ArgumentList $signArguments `
                                         -Wait `
                                         -PassThru `
                                         -NoNewWindow `
                                         -RedirectStandardOutput $tempOut `
                                         -RedirectStandardError $tempErr
            
            if ($signProcess.ExitCode -ne 0) {
                $errorOutput = Get-Content $tempErr -Raw
                $logMsg = Write-Log "Signing failed with exit code $($signProcess.ExitCode)" "ERROR"
                Append-LogDisplay $logMsg -Color ([System.Drawing.Color]::Red)
                
                if ($errorOutput) {
                    $logMsg = Write-Log "Error details: $errorOutput" "ERROR"
                    Append-LogDisplay $logMsg -Color ([System.Drawing.Color]::Red)
                }
                
                throw "Signing process failed"
            }
            
            $logMsg = Write-Log "Signing completed successfully" "SUCCESS"
            Append-LogDisplay $logMsg -Color ([System.Drawing.Color]::Green)
            Update-Progress 70
            Start-Sleep -Milliseconds 500
        }
        finally {
            if (Test-Path $tempOut) { Remove-Item $tempOut -Force -ErrorAction SilentlyContinue }
            if (Test-Path $tempErr) { Remove-Item $tempErr -Force -ErrorAction SilentlyContinue }
        }
        
        # Step 4: Verify signature
        Update-Status "Verifying signature..." -Color ([System.Drawing.Color]::Blue)
        Append-LogDisplay "[4/4] Verifying signature..." -Color ([System.Drawing.Color]::Blue)
        
        $signToolPath = Get-Command signtool.exe -ErrorAction SilentlyContinue
        
        if ($signToolPath) {
            $tempOut = [System.IO.Path]::GetTempFileName()
            $tempErr = [System.IO.Path]::GetTempFileName()
            
            try {
                $verifyProcess = Start-Process -FilePath $signToolPath.Source `
                                               -ArgumentList @("verify", "/pa", "`"$script:launcherPath`"") `
                                               -Wait `
                                               -PassThru `
                                               -NoNewWindow `
                                               -RedirectStandardOutput $tempOut `
                                               -RedirectStandardError $tempErr
                
                if ($verifyProcess.ExitCode -ne 0) {
                    $logMsg = Write-Log "Signature verification failed" "WARNING"
                    Append-LogDisplay $logMsg -Color ([System.Drawing.Color]::Orange)
                }
                else {
                    $logMsg = Write-Log "Signature verified successfully" "SUCCESS"
                    Append-LogDisplay $logMsg -Color ([System.Drawing.Color]::Green)
                }
            }
            finally {
                if (Test-Path $tempOut) { Remove-Item $tempOut -Force -ErrorAction SilentlyContinue }
                if (Test-Path $tempErr) { Remove-Item $tempErr -Force -ErrorAction SilentlyContinue }
            }
        }
        else {
            $logMsg = Write-Log "signtool.exe not found - skipping verification" "WARNING"
            Append-LogDisplay $logMsg -Color ([System.Drawing.Color]::Orange)
        }
        
        Update-Progress 100
        Update-Status "SUCCESS: launcher.exe has been signed!" -Color ([System.Drawing.Color]::Green)
        
        $logMsg = Write-Log "Signing process completed successfully" "SUCCESS"
        Append-LogDisplay "" 
        Append-LogDisplay "════════════════════════════════════════════════════════" -Color ([System.Drawing.Color]::Green)
        Append-LogDisplay "SUCCESS: launcher.exe has been signed!" -Color ([System.Drawing.Color]::Green)
        Append-LogDisplay "════════════════════════════════════════════════════════" -Color ([System.Drawing.Color]::Green)
        
        [System.Windows.Forms.MessageBox]::Show(
            "launcher.exe has been signed successfully!`n`nThe signed file is ready for distribution.",
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
$form.Text = "SimplySign™ Launcher Signing Tool"
$form.Size = New-Object System.Drawing.Size(700, 600)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $true

# Header label
$headerLabel = New-Object System.Windows.Forms.Label
$headerLabel.Location = New-Object System.Drawing.Point(10, 10)
$headerLabel.Size = New-Object System.Drawing.Size(660, 30)
$headerLabel.Text = "SimplySign™ Launcher Code Signing Tool"
$headerLabel.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$headerLabel.ForeColor = [System.Drawing.Color]::DarkBlue
$form.Controls.Add($headerLabel)

# Info panel
$infoPanel = New-Object System.Windows.Forms.GroupBox
$infoPanel.Location = New-Object System.Drawing.Point(10, 50)
$infoPanel.Size = New-Object System.Drawing.Size(660, 100)
$infoPanel.Text = "Configuration"
$form.Controls.Add($infoPanel)

# Launcher path label
$launcherLabel = New-Object System.Windows.Forms.Label
$launcherLabel.Location = New-Object System.Drawing.Point(10, 25)
$launcherLabel.Size = New-Object System.Drawing.Size(640, 20)
$launcherLabel.Text = "Launcher: $script:launcherPath"
$infoPanel.Controls.Add($launcherLabel)

# Timestamp server label
$timestampLabel = New-Object System.Windows.Forms.Label
$timestampLabel.Location = New-Object System.Drawing.Point(10, 50)
$timestampLabel.Size = New-Object System.Drawing.Size(640, 20)
$timestampLabel.Text = "Timestamp Server: $script:timestampServer"
$infoPanel.Controls.Add($timestampLabel)

# SimplySign label
$simplySignLabel = New-Object System.Windows.Forms.Label
$simplySignLabel.Location = New-Object System.Drawing.Point(10, 75)
$simplySignLabel.Size = New-Object System.Drawing.Size(640, 20)
$simplySignLabel.Text = "SimplySign: $script:simplySignExe"
$infoPanel.Controls.Add($simplySignLabel)

# Progress bar
$progressBar = New-Object System.Windows.Forms.ProgressBar
$progressBar.Location = New-Object System.Drawing.Point(10, 160)
$progressBar.Size = New-Object System.Drawing.Size(660, 25)
$progressBar.Minimum = 0
$progressBar.Maximum = 100
$progressBar.Value = 0
$form.Controls.Add($progressBar)

# Status label
$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Location = New-Object System.Drawing.Point(10, 195)
$statusLabel.Size = New-Object System.Drawing.Size(660, 20)
$statusLabel.Text = "Ready to sign"
$statusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($statusLabel)

# Log text box
$logTextBox = New-Object System.Windows.Forms.RichTextBox
$logTextBox.Location = New-Object System.Drawing.Point(10, 225)
$logTextBox.Size = New-Object System.Drawing.Size(660, 260)
$logTextBox.Font = New-Object System.Drawing.Font("Consolas", 9)
$logTextBox.ReadOnly = $true
$logTextBox.BackColor = [System.Drawing.Color]::White
$logTextBox.BorderStyle = "FixedSingle"
$form.Controls.Add($logTextBox)

# Button panel
$buttonPanel = New-Object System.Windows.Forms.Panel
$buttonPanel.Location = New-Object System.Drawing.Point(10, 495)
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
    $logTextBox.AppendText("SimplySign™ Launcher Signing Tool`r`n")
    $logTextBox.AppendText("═══════════════════════════════════════════════════════`r`n")
    $logTextBox.AppendText("`r`n")
    $logTextBox.AppendText("Ready to sign launcher.exe`r`n")
    $logTextBox.AppendText("Click 'Sign Launcher' to begin the signing process.`r`n")
    $logTextBox.AppendText("`r`n")
    $logTextBox.AppendText("Error log will be saved to:`r`n")
    $logTextBox.AppendText("$script:logFilePath`r`n")
})

[void]$form.ShowDialog()
