# Update Signing Keys Setup

## What are Update Keys?

Tauri uses cryptographic signing for secure auto-updates. This is separate from code signing and is used to verify that updates come from you.

## Generating Keys

Run this command to generate update signing keys:

```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/tiktok-stream-tool.key
```

You will be prompted to enter a password to protect the private key.

### Output

The command will generate:
- **Private key**: Saved to `~/.tauri/tiktok-stream-tool.key`
- **Public key**: Displayed in the terminal

### Example Output:

```
Private key: dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5...
Public key: dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEFBQUFBQUFBQUFB...
```

## Important Steps

1. **Save the Private Key Securely**
   - Keep `~/.tauri/tiktok-stream-tool.key` safe
   - NEVER commit it to git
   - You need it to sign updates
   - If lost, you'll need to generate new keys and update all apps

2. **Update tauri.conf.json**
   - Copy the public key from the terminal output
   - Replace `WILL_BE_GENERATED_LATER` in `src-tauri/tauri.conf.json`
   - The public key goes in the `updater.pubkey` field

3. **Building with Signing**

When building releases, set the environment variable:

**Linux/macOS:**
```bash
export TAURI_PRIVATE_KEY="$(cat ~/.tauri/tiktok-stream-tool.key)"
npm run tauri:build
```

**Windows (PowerShell):**
```powershell
$env:TAURI_PRIVATE_KEY = Get-Content ~/.tauri/tiktok-stream-tool.key -Raw
npm run tauri:build
```

**Windows (CMD):**
```cmd
set /p TAURI_PRIVATE_KEY=<"%USERPROFILE%\.tauri\tiktok-stream-tool.key"
npm run tauri:build
```

## Update Manifest Files

After building with signing, you'll get these files:
- `latest.json` - Update manifest
- `*.sig` files - Signatures for each installer

Upload all of these to your GitHub Release along with the installers.

## Security Notes

- ✅ Public key: Safe to commit to git, included in your app
- ❌ Private key: NEVER commit, keep secure
- The password protects the private key file
- Users verify updates using the public key embedded in the app

## Without Auto-Updates

If you don't want auto-updates, you can:
1. Set `"active": false` in the updater config in `tauri.conf.json`
2. Skip key generation
3. Users will need to manually download new versions
