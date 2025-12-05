# Certum Code Signing for Launcher

This directory contains scripts and documentation for signing `launcher.exe` using **Windows signtool** with **Certum SimplySign™** certificates.

> **⚠️ IMPORTANT - PowerShell Users:** If you encounter an execution policy error when running the PowerShell script, see the [PowerShell Execution Policy](#powershell-execution-policy) section below for solutions.

> **ℹ️ NOTE:** These scripts use **Windows signtool.exe** (from Windows SDK) to sign executables using certificates from the Windows Certificate Store. For Certum SimplySign, ensure your certificate is installed in the Windows Certificate Store first.

---

## 📋 Overview

Code signing helps establish trust by:
- ✅ Verifying the software publisher's identity
- ✅ Ensuring the executable hasn't been tampered with
- ✅ Reducing Windows SmartScreen warnings
- ✅ Building user confidence in the application

**Certum SimplySign™** is a cloud-based code signing solution that meets eIDAS standards and provides qualified electronic signatures.

---

## 🎯 Prerequisites

### Required Software

1. **Windows SDK (signtool.exe)**
   - Download from: [Microsoft Windows SDK](https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/)
   - Scripts automatically search common installation locations
   - Required for signing executables

2. **Certum SimplySign™ Certificate**
   - Download from: [https://www.certum.eu/en/cert_services_sign_code.html](https://www.certum.eu/en/cert_services_sign_code.html)
   - Documentation: [Certum Code Signing Manual](https://files.certum.eu/documents/manual_en/CS-Code_Signing_in_the_Cloud_Signtool_jarsigner_signing.pdf)
   - **IMPORTANT:** Install the certificate in Windows Certificate Store (not as a file)
   - The certificate must be accessible to signtool.exe

3. **Certum SimplySign™ Mobile App** (for Cloud HSM)
   - Required for 2FA during signing process
   - Download from your mobile app store

### System Requirements

- **Operating System:** Windows 10/11 (64-bit)
- **Network:** Internet connection (for timestamp server and Certum Cloud HSM)
- **Permissions:** Administrator rights may be required

---

## 🚀 Usage

### Option 1: GUI Tool (Recommended - Easy to Use)

**Visual interface with real-time progress and error logging:**

```powershell
cd simplysign
.\sign-launcher-gui.ps1
```

**Features:**
- ✅ User-friendly graphical interface
- ✅ Real-time progress display
- ✅ Color-coded status messages
- ✅ Comprehensive error logging to file
- ✅ View error logs with one click
- ✅ Visual confirmation of success/failure
- ✅ Step-by-step process display

**Error Log:** All operations are logged to `sign-launcher-error.log` in the same directory.

**Screenshot:** The GUI provides:
- Configuration display (launcher path, timestamp server)
- Progress bar showing signing progress
- Real-time log output with color coding
- Buttons for signing, viewing logs, and closing

### Option 2: Batch Script (Quick Command-Line)

Simple double-click execution:

```batch
cd simplysign
sign-launcher.bat
```

The script will:
1. ✅ Verify `launcher.exe` exists in parent directory
2. ✅ Check SimplySign™ Desktop is installed
3. ✅ Sign the executable with timestamp
4. ✅ Verify the signature (if signtool available)
5. ✅ Display success/error messages

### Option 3: PowerShell Script (Advanced/Automation)

For more control and scripting integration:

```powershell
cd simplysign
.\sign-launcher.ps1
```

**With custom parameters:**

```powershell
# Sign launcher at custom path
.\sign-launcher.ps1 -LauncherPath "C:\path\to\launcher.exe"

# Use different timestamp server
.\sign-launcher.ps1 -TimestampServer "https://timestamp.sectigo.com"

# Custom signtool path (if not in standard Windows SDK locations)
.\sign-launcher.ps1 -SigntoolPath "C:\CustomPath\signtool.exe"
```

### PowerShell Execution Policy

**If you encounter an execution policy error** (script is not digitally signed), you have several options:

#### Option 1: Bypass for Single Execution (Recommended)
Run PowerShell with bypass flag:
```powershell
powershell -ExecutionPolicy Bypass -File .\sign-launcher.ps1
```

#### Option 2: Bypass for Current Session
Allow scripts for the current PowerShell session only:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\sign-launcher.ps1
```

#### Option 3: Unblock the Script File
Unblock the downloaded script (removes "downloaded from internet" flag):
```powershell
Unblock-File -Path .\sign-launcher.ps1
.\sign-launcher.ps1
```

#### Option 4: Change User Policy (Less Secure)
Change execution policy for current user (persists across sessions):
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
.\sign-launcher.ps1
```

**Note:** The batch script (`sign-launcher.bat`) and GUI tool (`sign-launcher-gui.ps1`) may also require execution policy adjustments. Use the same solutions above.

---

## 📁 Files in This Directory

| File | Description |
|------|-------------|
| `sign-launcher-gui.ps1` | **GUI application** with visual interface, progress display, and error logging (Recommended) |
| `sign-launcher.bat` | Batch script for automated signing (Windows command-line) |
| `sign-launcher.ps1` | PowerShell script with advanced features and parameter support (Automation) |
| `sign-launcher-error.log` | Error log file (created automatically by GUI tool) |
| `README.md` | This documentation file |

---

## 🔧 Configuration

### Command-Line Format

The scripts use **Windows signtool.exe** with the following command format:
```
signtool.exe sign /a /fd sha256 /tr "https://timestamp.digicert.com" /td sha256 "file.exe"
```

**Parameters explained:**
- `/a` - Automatically select the best signing certificate
- `/fd sha256` - File digest algorithm
- `/tr <url>` - RFC 3161 timestamp server URL
- `/td sha256` - Timestamp digest algorithm

This is the recommended format for Certum SimplySign certificates in the Windows Certificate Store.

### Timestamp Server

Both scripts use DigiCert's timestamp server by default:
```
https://timestamp.digicert.com
```

**Alternative timestamp servers:**
- `https://timestamp.sectigo.com` (Sectigo/Comodo)
- `http://timestamp.globalsign.com/tsa/g6` (GlobalSign)

**Note:** Always prefer HTTPS timestamp servers when available for enhanced security.

Timestamping ensures the signature remains valid even after the certificate expires.

### Windows SDK / signtool Path

The scripts automatically search for signtool.exe in common Windows SDK locations:
- `C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe`
- `C:\Program Files\Windows Kits\10\bin\*\x64\signtool.exe`
- System PATH

If signtool.exe is installed in a custom location, you can specify it:

**In PowerShell script (`sign-launcher.ps1`):**
```powershell
.\sign-launcher.ps1 -SigntoolPath "C:\CustomPath\signtool.exe"
```

**Note:** The scripts will automatically detect the latest version of signtool from the Windows SDK.

---

## ✅ Verification

### Manual Verification (Windows Explorer)

1. Right-click `launcher.exe`
2. Select **Properties**
3. Go to **Digital Signatures** tab
4. Verify signature shows your certificate details

### Command Line Verification (with signtool)

```batch
signtool verify /pa ..\launcher.exe
```

Expected output:
```
Successfully verified: launcher.exe
```

---

## ❌ Troubleshooting

### PowerShell Error: "File is not digitally signed" / "UnauthorizedAccess"

**Error message (English):**
```
The file cannot be loaded. The file is not digitally signed. You cannot run this script on the current system.
```

**Error message (German):**
```
Die Datei kann nicht geladen werden. Die Datei ist nicht digital signiert. 
Sie können dieses Skript im aktuellen System nicht ausführen.
```

**Solution:**
This is a PowerShell execution policy restriction. Choose one of these solutions:

1. **Use the batch script instead** (no restrictions):
   ```batch
   sign-launcher.bat
   ```

2. **Run with bypass flag** (recommended):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\sign-launcher.ps1
   ```

3. **Unblock the file**:
   ```powershell
   Unblock-File -Path .\sign-launcher.ps1
   .\sign-launcher.ps1
   ```

4. **Set execution policy for current session**:
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   .\sign-launcher.ps1
   ```

See [PowerShell Execution Policy](#powershell-execution-policy) section for more details.

### Error: "signtool.exe not found"

**Solution:**
1. Install Windows SDK:
   - Download from: [https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/](https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/)
   - During installation, ensure "Windows SDK Signing Tools for Desktop Apps" is selected
2. The scripts automatically search common SDK locations
3. Restart command prompt/PowerShell after installation
4. If installed in a custom location, use the `-SigntoolPath` parameter

### Error: "Signing failed"

**Common causes:**
1. **No certificate in Windows Certificate Store**
   - Install your Certum certificate in Windows Certificate Store
   - Use Certum SimplySign Desktop to install the certificate
   - Ensure certificate is valid and not expired

2. **Certificate not accessible**
   - Verify certificate is in the "Personal" or "My" certificate store
   - Run PowerShell/Command Prompt as Administrator
   - Check that the certificate has a private key associated

3. **File locked**
   - Close any programs using `launcher.exe`
   - Stop the application if running

4. **Network issues**
   - Check internet connection (required for Certum Cloud HSM and timestamp server)
   - Verify timestamp server is accessible
   - Try alternative timestamp server
   - Ensure Certum SimplySign Mobile App is ready for 2FA

### Error: "launcher.exe not found"

**Solution:**
- Ensure `launcher.exe` exists in the parent directory (project root)
- Build the launcher first using instructions in `build-src/README.md`

### Warning: "Signature verification failed"

**Solution:**
- File may be signed but signature is invalid
- Check certificate chain is complete
- Verify certificate is trusted by Windows
- Try signing again with correct certificate

---

## 🔐 Security Best Practices

### Certificate Management

- ✅ **Store certificates securely** - Use hardware tokens or secure storage
- ✅ **Protect private keys** - Never share or commit to version control
- ✅ **Use strong passwords** - For certificate/key protection
- ✅ **Enable two-factor authentication** - For SimplySign™ account
- ✅ **Monitor certificate expiration** - Set reminders to renew

### Signing Process

- ✅ **Always timestamp** - Signatures remain valid after cert expiration
- ✅ **Verify after signing** - Check signature is valid
- ✅ **Keep unsigned backups** - For rebuild/re-signing if needed
- ✅ **Document signing process** - For team consistency
- ✅ **Use trusted timestamp servers** - From reputable CAs

### Distribution

- ✅ **Only distribute signed executables** - Never distribute unsigned builds
- ✅ **Verify signature before distribution** - Ensure signing succeeded
- ✅ **Use HTTPS for downloads** - Prevent man-in-the-middle attacks
- ✅ **Provide checksums** - SHA256 hashes for verification

---

## 📚 Additional Resources

### Certum SimplySign™ Documentation
- [Certum Code Signing Services](https://www.certum.eu/en/cert_services_sign_code.html)
- [Certum SimplySign Code Signing Manual](https://files.certum.eu/documents/manual_en/CS-Code_Signing_in_the_Cloud_Signtool_jarsigner_signing.pdf)
- [SimplySign Website](https://www.simplysign.eu/)
- [eIDAS Standards](https://ec.europa.eu/digital-building-blocks/wikis/display/DIGITAL/eIDAS)

### Code Signing Resources
- [Microsoft Code Signing](https://docs.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools)
- [Best Practices for Code Signing](https://docs.microsoft.com/en-us/windows-hardware/drivers/dashboard/code-signing-best-practices)
- [Windows Authenticode](https://docs.microsoft.com/en-us/windows-hardware/drivers/install/authenticode)

### Certificate Authorities
- [Certum](https://www.certum.eu/en/cert_services_sign_code.html)
- [DigiCert](https://www.digicert.com/signing/code-signing-certificates)
- [Sectigo](https://sectigo.com/ssl-certificates-tls/code-signing)
- [GlobalSign](https://www.globalsign.com/en/code-signing-certificate)

---

## 🤝 Support

If you encounter issues:

1. **Check this README** - Most common issues are documented
2. **Review error messages** - Scripts provide detailed error information
3. **Check SimplySign™ Desktop** - Look for error details in the application
4. **Contact support** - Email: [loggableim@gmail.com](mailto:loggableim@gmail.com)

---

## ⚖️ Legal Notice

- **SimplySign™** is a trademark of Unizeto Technologies SA
- This project is not affiliated with or endorsed by SimplySign™
- Code signing certificates and services are subject to their respective terms and conditions
- Always comply with certificate usage policies and regulations

---

## 📝 License

This signing infrastructure is part of **Pup Cid's Little TikTok Helper (LTTH)**

**License:** CC BY-NC 4.0 (Creative Commons Attribution-NonCommercial 4.0 International)

---

**Last Updated:** December 2024  
**Maintained by:** PupCid & Claude AI
