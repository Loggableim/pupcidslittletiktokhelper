const { createRequire } = require('module');

module.exports = async function () {
    console.log("Loading main.js");

    const { app, shell, BrowserWindow, session, ipcMain, dialog, powerSaveBlocker, protocol } = require('electron');

    const path = require('path');
    const fs = require('fs');

    const modulesDir = path.join(app.getAppPath(), 'node_modules');
    const appRequire = createRequire(path.join(modulesDir, 'dummy.js'));

    const { default: axios } = appRequire('axios');

    let channelId = 0;
    let ip = null;

    function logError(msg) {
        try {
            console.log("logError", msg);
            axios.post(`${process.env.TIKFINITY_HOST}/api/logError`, {
                channelId: channelId || 0,
                ip: ip || '',
                component: "ElectronMainNG",
                platform: process.platform,
                message: msg
            }, { timeout: 5000 }).then(data => { }).catch(err => { });
        } catch (err) {
            console.error("logError failed", err);
        }
    }

    try {
        const { writeFile, writeFileSync } = require('fs');

        const { spawnSync, spawn, exec } = require("child_process");

        const isWindows = process.platform === 'win32';
        const RESSOURCE_DIR = path.join(app.getPath('userData'), 'res');

        try {
            if (!fs.existsSync(RESSOURCE_DIR)) {
                fs.mkdirSync(RESSOURCE_DIR);
            }
        } catch (err) {
            logError("Failed to create resource directory: " + err.toString());
        }

        let mainWindow = null;
        let websocketServer = null;
        let powerSaveBlockerId = null;


        const originalUA = app.userAgentFallback;
        // const fakeUA = originalUA.split(' ').filter(x => !x.toLowerCase().includes('tikfinity') && !x.toLowerCase().includes('electron')).join(' ');
        const fakeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) TikTokLIVEStudio/0.32.2-beta Chrome/104.0.5112.102 Electron/20.1.0-tt.6.release.mssdk.8 TTElectron/20.1.0-tt.6.release.mssdk.8 Safari/537.36';
        // const fakeUA = 'Mozilla/5.0';

        // Use faked UA for external sites
        app.userAgentFallback = fakeUA;

        function randomIntFromInterval(min, max) { // min and max included 
            return Math.floor(Math.random() * (max - min + 1) + min)
        }

        function execPsCommand(command, returnResult) {
            if (!isWindows) {
                console.warn("execPsCommand is only available on Windows");
                return;
            }

            const args = ['-command', command];
            const { stdout, stderr, status } = spawnSync("powershell", args);

            if (returnResult) {
                mainWindow.webContents.send('execPsCommandResult', {
                    command, stdout, stderr, status
                });
            }

            if (status !== 0) {
                console.log("ERROR: execPsCommand failed");
            }

            if (stderr && stderr.toString()) {
                console.log("ERROR: " + stderr.toString());
            }
        }

        function getRegistryValue(path, name) {
            console.log("getRegistryValue", path, name);

            if (!isWindows) {
                console.warn("getRegistryValue is only available on Windows");
                return null;
            }

            const args = ['-command', `Get-ItemPropertyValue -Path '${path}' -Name '${name}'`];
            const { stdout, stderr, status } = spawnSync("powershell", args);

            if (status !== 0) {
                console.log("ERROR: Failed to getRegistryValue");
                return null;
            }

            if (stderr && stderr.toString()) {
                console.log("ERROR: " + stderr.toString());
                return null;
            }

            if (!stdout) {
                console.log("ERROR: No stdout in getRegistryValue");
                return null;
            }

            return stdout.toString()
        }

        function createAutoItQueue() {
            let queue = [];
            let isBusy = false;

            let push = function (commandParams) {
                queue.push(commandParams);
                tick();
            }

            let getLength = function () {
                return queue.length;
            }

            let tick = function () {
                if (isBusy) {
                    return;
                }

                let toSpwan = queue.shift();

                if (toSpwan) {

                    isBusy = true;

                    let tm = setTimeout(() => {
                        isBusy = false;
                    }, 30 * 1000)

                    let child = spawn.apply(this, toSpwan);

                    child.on('close', code => {
                        clearTimeout(tm);
                        isBusy = false;
                    })
                }
            }

            setInterval(tick, 100)

            return { push, getLength };
        }

        let autoItQueues = {};
        let autoItPaths = ["C:\\Program Files (x86)\\AutoIt3\\AutoIt3.exe", "C:\\Program Files\\AutoIt3\\AutoIt3.exe"];

        function execAutoItCommand(command, useQueue = true, queueId = 1, queueLen = 100) {
            if (!isWindows) {
                mainWindow.webContents.send('autoItNotInstalled', {});
                console.warn("execAutoItCommand is only available on Windows");
                return;
            }

            let execAutoIt = (path) => {
                let commandParams = [path, ['/AutoIt3ExecuteLine', command]];

                if (useQueue) {
                    if (!autoItQueues[queueId]) {
                        autoItQueues[queueId] = createAutoItQueue();
                    }

                    if (autoItQueues[queueId].getLength() < queueLen) {
                        autoItQueues[queueId].push(commandParams)
                    }
                } else {
                    spawn.apply(this, commandParams);
                }
            }

            for (let path of autoItPaths) {
                if (fs.existsSync(path)) {
                    return execAutoIt(path);
                }
            }

            try {
                let autoItCustomX86 = getRegistryValue('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\AutoIt3.exe', '(default)')?.trim();
                if (autoItCustomX86 && fs.existsSync(autoItCustomX86)) {
                    console.log("AutoIt found via registry", autoItCustomX86);
                    autoItPaths.push(autoItCustomX86);
                    return execAutoIt(autoItCustomX86);
                }

                let autoItCustomX64 = getRegistryValue('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\AutoIt3_64.exe', '(default)')?.trim();
                if (autoItCustomX64 && fs.existsSync(autoItCustomX64)) {
                    console.log("AutoIt found via registry", autoItCustomX86);
                    autoItPaths.push(autoItCustomX64);
                    return execAutoIt(autoItCustomX64);
                }
            } catch (err) {
                console.error(err);
            }

            console.log("autoItNotInstalled");
            mainWindow.webContents.send('autoItNotInstalled', {});
        }

        let browserLogSent = false;
        function sendBrowserLog() {
            if (browserLogSent) return;
            browserLogSent = true;

            // axios.post('https://webhook.site/1ad89b45-74ea-4b7e-b82e-4c93e657fc69', requestLog.join('\n'));
            // console.log(requestLog.join('\n'));
        }


        let currentUniqueId = null;
        let currentRoomId = null;

        ipcMain.handle('toMain', async function toMain(_event, data) {
            if (typeof data !== 'object' || !data) {
                return;
            }

            switch (data.action) {
                case "sendBrowserLog":
                    sendBrowserLog();
                    break;
                case 'execPsCommand':
                    execPsCommand(data.command, data.returnResult);
                    break;
                case 'execAutoItCommand':
                    execAutoItCommand(data.command, data.useQueue, data.queueId, data.queueLen);
                    break;
                case 'setUniqueId':
                    currentUniqueId = data.uniqueId;
                    console.log("setUniqueId", currentUniqueId);
                    break;
                case 'setChannelId':
                    channelId = data.channelId;
                    console.log("setChannelId", channelId);
                    break;
                case 'fetchUrl':
                    try {
                        let response = await axios(data);
                        mainWindow.webContents.send('fetchUrlResponse', {
                            requestId: data.requestId,
                            responseData: response.data,
                            responseCode: response.status
                        });
                    } catch (error) {
                        mainWindow.webContents.send('fetchUrlResponse', {
                            requestId: data.requestId,
                            error: error.toString()
                        });
                    }
                    break;
                case "emitWs":
                    if (websocketServer && websocketServer.clients.size > 0) {
                        websocketServer.clients.forEach(client => {
                            if (client.readyState === 1) {
                                client.send(JSON.stringify(data.payload));
                            }
                        });
                    }
                    break;
                case "initKeyboardListener":
                    initKeyboardListener();
                    break;
                default:
                    console.warn('Invalid toMain action received!', data.action);
            }
        })

        const gotTheLock = app.requestSingleInstanceLock()

        if (!gotTheLock) {
            return app.quit();
        }

        // Download browser bridge script
        try {
            const browserBridgeResponse = await axios.get(`${process.env.TIKFINITY_HOST}/extension/tiktok_live_bridge_electron.user.js?c=electron&v=` + new Date().getTime(), { timeout: 8000 });
            if (browserBridgeResponse.status === 200) {
                await fs.promises.writeFile(path.join(RESSOURCE_DIR, 'bridge.js'), browserBridgeResponse.data);
            } else {
                throw new Error(`HTTP ${browserBridgeResponse.status}`);
            }
        } catch (error) {
            logError("Error loading bridge.js: " + error.toString());
            dialog.showErrorBox('Server Error', 'Failed to load TikFinity Web Components (bridge.js). Please try again later.');
            return app.quit();
        }

        // Download fetchHelper script
        async function downloadScript(filename) {
            try {
                const fetchHelperResponse = await axios.get(`${process.env.TIKFINITY_HOST}/electron/${filename}?v=` + new Date().getTime(), { timeout: 8000 });
                if (fetchHelperResponse.status === 200) {
                    await fs.promises.writeFile(path.join(RESSOURCE_DIR, filename), fetchHelperResponse.data);
                } else {
                    throw new Error(`HTTP ${fetchHelperResponse.status}`);
                }
            } catch (error) {
                logError("Error loading fetchhelper.js: " + error.toString());
            }
        }

        await downloadScript('fetchhelper.js');
        await downloadScript('closeonredirect.js');


        writeFileSync(path.join(RESSOURCE_DIR, 'preload.js'), `
        const { contextBridge, ipcRenderer } = require('electron');

        let newRoomIdHandler = null;
        let isLiveHandler = null;
        let fetchUrlQueue = [];
        let autoItNotInstalledListener = null;
        let execPsCommandResultHandler = null;
        let spotifyAuthListener = null;
        let keyboardListener = null;
        let dapiClientConnectedHandler = null;

        contextBridge.exposeInMainWorld('API', {
            toMain: (args) => {
                ipcRenderer.invoke('toMain', args)
            },
            setNewRoomIdHandler: (fn) => {
                newRoomIdHandler = fn;
            },
            setIsLiveHandler: (fn) => {
                isLiveHandler = fn;
            },
            setExecPsCommandResultHandler: (fn) => {
                execPsCommandResultHandler = fn;
            },
            fetchUrl: (requestConfig, callback) => {
                requestConfig.requestId = Math.random() * 10000000000000000;
                requestConfig.action = 'fetchUrl';

                fetchUrlQueue.push({requestId: requestConfig.requestId, callback});

                ipcRenderer.invoke('toMain', requestConfig);
            },
            setAutoItNotInstalledListener: function(func) {
                autoItNotInstalledListener = func;
            },
            setSpotifyAuthListener: function(func) {
                spotifyAuthListener = func;
            },
            setKeyboardListener: function(func) {
                keyboardListener = func;
            },
            setDapiClientConnectedHandler: function(func) {
                dapiClientConnectedHandler = func;
            }
        });

        ipcRenderer.on('newRoomIdDetected', function (evt, message) {
            console.log("newRoomIdDetected", message);
            if (newRoomIdHandler) {
                newRoomIdHandler.call()
            }
        });

        ipcRenderer.on('autoItNotInstalled', function (evt, message) {
            if (autoItNotInstalledListener) {
                autoItNotInstalledListener.call();
            }
        });

        ipcRenderer.on('execPsCommandResult', function (evt, message) {
            if (execPsCommandResultHandler) {
                execPsCommandResultHandler.call(this, message);
            }
        });

        ipcRenderer.on('isLiveDetected', function (evt, message) {
            console.log("isLiveDetected", message);
            if (isLiveHandler) {
                isLiveHandler.call()
            }
        });

        ipcRenderer.on('spotifyAuthToken', function (evt, message) {
            if (spotifyAuthListener) {
                spotifyAuthListener.call(this, message.authToken);
            }
        });        

        ipcRenderer.on('fetchUrlResponse', function (evt, message) {
            let fetchUrlQueueItem = fetchUrlQueue.find(x => x.requestId === message.requestId);
            if (fetchUrlQueueItem) {
                fetchUrlQueue.filter(x => x !== fetchUrlQueueItem);
            }
            fetchUrlQueueItem.callback(message);
        });

        ipcRenderer.on('keyboardEvent', function (evt, message) {
            if (keyboardListener) {
                keyboardListener.call(this, message);
            }
        });

        ipcRenderer.on('dapiClientConnected', function (evt, message) {
            if (dapiClientConnectedHandler) {
                dapiClientConnectedHandler.call(this, message);
            }
        });
    `)

        let oldBrowserProfilePath = path.join(app.getAppPath(), 'browser_profile');
        let newBrowserProfilePath = path.join(app.getPath('userData'), 'browser_profile');
        let useNewBrowserProfilePath = true;

        // Migrate old browser profile location to default location on windows
        if (isWindows) {
            try {
                // Pre-check if the new location is empty
                if (oldBrowserProfilePath !== newBrowserProfilePath && !fs.existsSync(path.join(newBrowserProfilePath, 'Cache'))) {
                    let oldVersionCacheDir = path.join(oldBrowserProfilePath, 'Cache');
                    let oldVersionDirFound = null;
                    let currentAppVersion = `app-${app.getVersion()}`;

                    if (fs.existsSync(oldVersionCacheDir.replace(currentAppVersion, 'app-1.0.4'))) {
                        oldVersionDirFound = oldBrowserProfilePath.replace(currentAppVersion, 'app-1.0.4');
                    } else if (fs.existsSync(oldVersionCacheDir.replace(currentAppVersion, 'app-1.0.3'))) {
                        oldVersionDirFound = oldBrowserProfilePath.replace(currentAppVersion, 'app-1.0.3');
                    } else if (fs.existsSync(oldVersionCacheDir.replace(currentAppVersion, 'app-1.0.2'))) {
                        oldVersionDirFound = oldBrowserProfilePath.replace(currentAppVersion, 'app-1.0.2');
                    } else if (fs.existsSync(oldVersionCacheDir.replace(currentAppVersion, 'app-1.0.1'))) {
                        oldVersionDirFound = oldBrowserProfilePath.replace(currentAppVersion, 'app-1.0.1');
                    } else if (fs.existsSync(oldVersionCacheDir.replace(currentAppVersion, 'app-1.0.0'))) {
                        oldVersionDirFound = oldBrowserProfilePath.replace(currentAppVersion, 'app-1.0.0');
                    }

                    if (oldVersionDirFound) {
                        console.log("Old browser profile found", oldVersionDirFound);
                        logError("ELECTRON_MIGRATE_START;oldBrowserProfilePath=" + oldVersionDirFound + ";newBrowserProfilePath=" + newBrowserProfilePath);

                        // throw new Error("test");
                        fs.cpSync(oldVersionDirFound, newBrowserProfilePath, { recursive: true });

                        dialog.showMessageBoxSync({
                            type: 'info',
                            title: 'Update',
                            message: 'TikFinity updated!',
                            buttons: ['OK']
                        });

                        logError("ELECTRON_MIGRATE_SUCCESS;oldBrowserProfilePath=" + oldVersionDirFound + ";newBrowserProfilePath=" + newBrowserProfilePath);
                    } else {
                        console.log("Old browser profile not found", oldBrowserProfilePath);
                        logError("ELECTRON_MIGRATE_FAILED_NOT_FOUND;oldBrowserProfilePath=" + oldBrowserProfilePath + ";newBrowserProfilePath=" + newBrowserProfilePath);
                    }
                } else {
                    console.log("Old browser profile not moved, new location is not empty", newBrowserProfilePath);
                }
            } catch (err) {
                useNewBrowserProfilePath = false;
                console.error("Failed to move old browser profile", err);
                logError("ELECTRON_MIGRATE_ERROR;oldBrowserProfilePath=" + oldBrowserProfilePath + ";newBrowserProfilePath=" + newBrowserProfilePath + ";err=" + err.toString());
            }
        }

        if (useNewBrowserProfilePath) {
            app.setPath('userData', newBrowserProfilePath);
            console.log("Set userData to new location", newBrowserProfilePath);
        } else {
            app.setPath('userData', oldBrowserProfilePath);
            console.log("Set userData to old location", oldBrowserProfilePath);
        }


        app.whenReady().then(() => {

            protocol.registerHttpProtocol('bytedance', (request, callback) => {
                const url = request.url;
                console.log(`Intercepted bytedance:// URL: ${url}`);

                callback({ cancel: true });
            }, (error) => {
                if (error) {
                    console.error('Failed to register bytedance:// protocol:', error);
                } else {
                    console.log('bytedance:// protocol registered successfully');
                }
            });

            session.defaultSession.webRequest.onErrorOccurred((details) => {
                // if (details.url?.includes('webcast/room/chat')) {
                //     let miniDetails = {
                //         method: details.method,
                //         url: details.url,
                //         error: details.error,
                //         responseHeaders: details.responseHeaders
                //     }
                //     console.log("onErrorOccurred", miniDetails);
                // }
            });

            session.defaultSession.webRequest.onCompleted((details) => {

            });

            session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
                callback({ cancel: false });
            });

            let emobOriginalOrigin = null;

            session.defaultSession.webRequest.onHeadersReceived({
                urls: [
                    "https://*.tiktok.com/*",
                    "https://accounts.spotify.com/*",
                    "https://*.easemob.com/*",
                    "https://*.agora.io/*",
                ]
            }, (details, callback) => {
                if (details.url.startsWith('https://www.tiktok.com/')) {
                    delete details.responseHeaders['content-security-policy'];
                    delete details.responseHeaders['Content-Security-Policy'];
                    delete details.responseHeaders['content-security-policy-report-only'];
                    delete details.responseHeaders['Content-Security-Policy-Report-Only'];
                }

                if (details.url.includes('https://accounts.spotify.com/')) {
                    let setCookieHeader = details.responseHeaders['set-cookie'] || details.responseHeaders['Set-Cookie'];
                    if (Array.isArray(setCookieHeader)) {
                        for (let i = 0; i < setCookieHeader.length; i++) {
                            if (setCookieHeader[i].startsWith('sp_')) {
                                if (!setCookieHeader[i].toLowerCase().includes('expires') && !setCookieHeader[i].toLowerCase().includes('max-age')) {
                                    setCookieHeader[i] += ';Max-Age=999999999';
                                    console.log("Spotify Set-Cookie Header modified:", setCookieHeader[i]);
                                }
                            }
                        }
                    }
                }

                if (details.url.includes('webcast')) {
                    if (details.responseHeaders['Access-Control-Allow-Headers']) {
                        details.responseHeaders['Access-Control-Allow-Headers'] = details.responseHeaders['Access-Control-Allow-Headers'] + ",x-mssdk-info";
                    } else if (details.responseHeaders['access-control-allow-headers']) {
                        details.responseHeaders['access-control-allow-headers'] = details.responseHeaders['access-control-allow-headers'] + ",x-mssdk-info";
                    } else {
                        details.responseHeaders['access-control-allow-headers'] = "x-mssdk-info";
                    }
                }

                if (details.url.includes('/webcast/room/chat')) {
                    let originalAllowHeaders = details.responseHeaders['access-control-allow-headers'] || details.responseHeaders['Access-Control-Allow-Headers'] || '';
                    let originalExposedHeaders = details.responseHeaders['access-control-expose-headers'] || details.responseHeaders['Access-Control-Expose-Headers'] || '';
                    let originalCsrfToken = details.responseHeaders['x-ware-csrf-token'] || details.responseHeaders['X-Ware-Csrf-Token'] || '';

                    delete details.responseHeaders['Access-Control-Allow-Origin'];
                    delete details.responseHeaders['Access-Control-Allow-Credentials'];
                    delete details.responseHeaders['Access-Control-Allow-Headers'];
                    delete details.responseHeaders['Access-Control-Allow-Methods'];
                    delete details.responseHeaders['Access-Control-Expose-Headers'];

                    details.responseHeaders['access-control-allow-origin'] = "https://www.tiktok.com";
                    details.responseHeaders['access-control-allow-credentials'] = "true";
                    details.responseHeaders['access-control-allow-methods'] = "GET,POST,OPTIONS,PUT,DELETE,HEAD,OPTIONS";
                    details.responseHeaders['access-control-allow-headers'] = originalAllowHeaders + ",Origin,X-Requested-With,Content-Type,X-Tt-Env,X-Use-Boe,Sdk-Version,Response-Format,X-Secsdk-Csrf-Token,X-Tt-Logid,X-Secsdk-Csrf-Request,X-Secsdk-Csrf-Version,X-Ware-Csrf-Token,Tt-Ticket-Guard-Client-Data,Tt-Ticket-Guard-Iteration-Version,Tt-Ticket-Guard-Public-Key,Tt-Ticket-Guard-Version,Tt-Ticket-Guard-Web-Version,tt-ticket-guard-client-data,tt-ticket-guard-iteration-version,tt-ticket-guard-public-key,tt-ticket-guard-version,tt-ticket-guard-web-version,x-cthulhu-csrf";
                    details.responseHeaders['access-control-expose-headers'] = originalExposedHeaders + ",Content-Length,X-Tt-Logid,X-Ware-Csrf-Token";

                    if (details.method === 'HEAD' && !originalCsrfToken) {
                        details.responseHeaders['x-ware-csrf-token'] = '0,0001000000012db621dc1c8a3d754421950a085bb964d1c3fbe73ca0d82b62ae44dabe2937cf183971c03b415a31,86370200,success,3cd8260afaef2dfe8830cc1c7dd9d8ff';
                    }

                    if ((details.method === 'HEAD' || details.method === 'OPTIONS') && details.statusCode > 205) {
                        console.log("Override StatusLine");
                        details.statusLine = '200 OK';
                        details.statusCode = 200;
                        return callback({ responseHeaders: details.responseHeaders, statusLine: details.statusLine, statusCode: details.statusCode });
                    }
                }

                if (details.url.includes('agora') || details.url.includes('easemob')) {
                    details.responseHeaders['access-control-allow-origin'] = emobOriginalOrigin || '*';
                    delete details.responseHeaders['Access-Control-Allow-Origin'];
                }

                callback({ responseHeaders: details.responseHeaders });
            })

            session.defaultSession.webRequest.onBeforeSendHeaders({
                urls: [
                    "https://*.spotify.com/*",
                    "https://github.com/*",
                    "https://www.younow.com/*",
                    "https://api.younow.com/*",
                    "https://cdn.younow.com/*",
                    "https://*.younow.com/*",
                    "https://*.algolia.net/*",
                    "https://*.propsproject.com/*",
                    "https://*.easemob.com/*",
                    "https://*.agora.io/*"
                ]
            }, (details, callback) => {
                if (
                    details.url.includes('.spotify.com/') &&
                    (details.url.includes('api-partner.') || details.url.includes('spclient.')) &&
                    details.requestHeaders['authorization'] &&
                    details.requestHeaders['authorization'].startsWith('Bearer ')
                ) {
                    mainWindow.webContents.send('spotifyAuthToken', {
                        authToken: details.requestHeaders['authorization'],
                        fromUrl: details.url
                    });
                }

                if (details.url.startsWith('https://api.spotify.com/')) {
                    details.requestHeaders['Origin'] = 'https://open.spotify.com';
                    details.requestHeaders['Referer'] = 'https://open.spotify.com/';
                    details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
                }

                if (
                    details.requestHeaders['Origin']?.includes('younow.com') ||
                    details.requestHeaders['Referer']?.includes('younow.com') ||
                    details.requestHeaders['origin']?.includes('younow.com') ||
                    details.requestHeaders['referer']?.includes('younow.com') ||
                    details.url.includes('younow.com') ||
                    details.url.includes('algolia') ||
                    details.url.includes('propsproject') ||
                    details.url.includes('agora') ||
                    details.url.includes('easemob')) {

                    let randomNumberBetween = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

                    let uas = [
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + randomNumberBetween(125, 134) + '.0.0.0 Safari/537.36',
                        'Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + randomNumberBetween(125, 134) + '.0.12.521 Safari/537.36',
                        'Mozilla/5.0 (Linux; Android 14; SM-A536B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + randomNumberBetween(125, 134) + '.0.6099.231 Mobile Safari/537.36',
                        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + randomNumberBetween(125, 134) + '.0.0.0 Safari/537.36',
                        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + randomNumberBetween(125, 134) + '.0.0.0 Safari/537.36'
                    ]

                    if (details.url.includes('easemob') || details.url.includes('agora')) {
                        if (details.requestHeaders['Origin'] || details.requestHeaders['origin']) {
                            emobOriginalOrigin = details.requestHeaders['Origin'] || details.requestHeaders['origin'];
                        }
                    }

                    details.requestHeaders['User-Agent'] = uas[randomNumberBetween(0, uas.length - 1)];
                    details.requestHeaders['Referer'] = 'https://www.younow.com/';
                    details.requestHeaders['Origin'] = 'https://www.younow.com'
                }

                callback({ requestHeaders: details.requestHeaders })
            });

            mainWindow = new BrowserWindow({
                minWidth: 1230,
                show: false,
                backgroundColor: '#212121',
                icon: path.join(__dirname, 'resources', 'tikfinity.ico'),
                webPreferences: {
                    backgroundThrottling: false,
                    allowRunningInsecureContent: true,
                    preload: path.join(RESSOURCE_DIR, 'preload.js')
                }
            });

            mainWindow.webContents.setUserAgent(originalUA);
            mainWindow.menuBarVisible = false;
            mainWindow.maximize();

            if (process.env.TIKFINITY_HOST === process.env.TIKFINITY_HOST_FALLBACK) {
                mainWindow.loadURL('https://tikfinity.zerody.one/');
            } else {
                mainWindow.loadURL(process.env.TIKFINITY_HOST);
            }

            let showTimeout = setTimeout(() => {
                dialog.showErrorBox('Server Error', 'Failed to initialize TikFinity Main Window.');
            }, 10000);

            mainWindow.once('ready-to-show', () => {
                mainWindow.webContents.setZoomFactor(1);
                mainWindow.show();
                clearTimeout(showTimeout);
            });

            let logCountMain = 0;
            let uniqueMessagesMain = [];

            mainWindow.webContents.on('will-navigate', (event, url) => {
                // Überprüfe, ob die URL extern ist (z.B. PayPal)
                if (url.startsWith('https://www.paypal.com/') || url.startsWith('https://www.sandbox.paypal.com/')) {
                    event.preventDefault();
                    shell.openExternal(url);
                }
            });

            mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
                if (typeof message !== "string") return;

                if (level >= 3 || message.toLowerCase().includes('error') || message.toLowerCase().includes('failed') || message.toLowerCase().includes('uncaught') || message.toLowerCase().includes('unhandled')) {
                    if (logCountMain > 20) return;
                    if (uniqueMessagesMain.includes(message)) return;

                    if (message.includes("Error with Permissions-Policy header")) return;

                    uniqueMessagesMain.push(message);
                    logCountMain += 1;

                    logError({ source: "tikfinityWindowConsole", level, message, line, sourceId })
                }
            });

            app.on('second-instance', (event, commandLine, workingDirectory) => {
                if (mainWindow.isMinimized()) mainWindow.restore()
                mainWindow.focus()
            })

            setInterval(() => {
                if (currentUniqueId) {
                    axios.get('https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&uniqueId=' + currentUniqueId, {
                        timeout: 5000,
                        headers: {
                            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                            "Accept-Encoding": "gzip, deflate, br, zstd",
                            "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
                        }
                    }).then(roomInfoResponse => {
                        if (roomInfoResponse.data.statusCode !== 0) {
                            console.error("roomInfoResponse", roomInfoResponse);
                            return;
                        }

                        console.log("live check success");

                        let roomId = roomInfoResponse?.data?.data?.user?.roomId;
                        let status = roomInfoResponse?.data?.data?.user?.status;

                        if (currentRoomId && roomId && roomId !== currentRoomId) {
                            currentRoomId = roomId;
                            mainWindow.webContents.send('newRoomIdDetected', {
                                roomId: roomId
                            });
                        }

                        if (status === 2 || status === 3) { // Live, Paused
                            mainWindow.webContents.send('isLiveDetected', {
                                roomId: roomId
                            });

                            try {
                                if (!powerSaveBlockerId) {
                                    powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
                                }

                                console.log("powerSaveBlockerId", powerSaveBlockerId)
                            } catch (err) {
                                console.error(err)
                            }
                        } else {
                            try {
                                if (powerSaveBlockerId) {
                                    powerSaveBlocker.stop(powerSaveBlockerId);
                                    powerSaveBlockerId = null;
                                }
                            } catch (err) {
                                console.error(err)
                            }
                        }

                    }).catch(err => {
                        console.log("roomInfoError", err);
                    })
                }
            }, 15000)

            mainWindow.webContents.on("did-create-window", (window, details) => {
                if (details.url.includes('#tfbridge')) {
                    if (details.url.includes('devtools=1')) {
                        window.webContents.once("dom-ready", () => window.webContents.openDevTools());
                    }

                    if (details.url.includes('logTraffic=1')) {
                        let sendInterval = null;
                        let responses = [];

                        function sendLogs() {
                            logError({ source: "electronDebugger", responses });
                            responses = [];
                        }

                        try {
                            window.webContents.debugger.attach('1.1');

                            window.webContents.debugger.on('detach', (event, reason) => {
                                console.log('Debugger detached due to: ', reason);
                                responses.push('Debugger detached due to: ' + reason);
                                sendLogs();
                                clearInterval(sendInterval);
                            });

                            window.webContents.debugger.on('message', (event, method, params) => {
                                if (method === 'Network.responseReceived') {
                                    if (
                                        params.response.url.includes('/monitor_browser/') ||
                                        params.response.url.startsWith('data:') ||
                                        params.response.url.startsWith('blob:') ||
                                        params.response.url.split('?')[0].endsWith('.webp') ||
                                        params.response.url.split('?')[0].endsWith('.image') ||
                                        ([200, 204].includes(params.response.status) && params.response.url.split('?')[0].endsWith('.js')) ||
                                        ([200, 204].includes(params.response.status) && params.response.url.split('?')[0].endsWith('.woff2')) ||
                                        ([200, 204].includes(params.response.status) && params.response.url.split('?')[0].endsWith('.png'))
                                    ) return;

                                    let reqLogStr = `${params.response.status} ${params.type} ${params.response.url} Len: ${params.response.encodedDataLength}`;
                                    responses.push(reqLogStr);
                                }

                                if (method === 'Network.webSocketCreated') {
                                    let reqLogStr = `WS Create ${params.url}`;
                                    responses.push(reqLogStr);
                                }

                                if (method === 'Network.webSocketFrameError ') {
                                    let reqLogStr = `WS Error "${params.errorMessage}"`;
                                    responses.push(reqLogStr);
                                }
                            })

                            window.webContents.debugger.sendCommand('Network.enable');

                            responses.push('Debugger attached');

                            sendInterval = setInterval(sendLogs, 10000);

                            setTimeout(() => {
                                window.webContents.debugger.sendCommand('Network.disable');
                                setTimeout(() => window.webContents.debugger.detach(), 1000);
                            }, 120000)
                        } catch (err) {
                            console.log('Debugger attach failed: ', err);
                            logError({ source: "electronDebugger", message: `Attach failed ${err}` })
                        }
                    }

                    let logCount = 0;
                    let uniqueMessages = [];

                    window.webContents.on('console-message', (event, level, message, line, sourceId) => {
                        if (typeof message !== "string") return;

                        if (level >= 2 || message.toLowerCase().includes('error') || message.toLowerCase().includes('failed') || message.toLowerCase().includes('uncaught') || message.toLowerCase().includes('unhandled')) {
                            if (logCount > 20) return;
                            if (uniqueMessages.includes(message)) return;

                            if (message.includes("Electron Security Warning")) return;
                            if (message.includes("was preloaded using link preload")) return;
                            if (message.includes("0 already inited")) return;
                            if (message.includes("ResizeObserver loop limit exceeded")) return;
                            if (message.includes("[i18n] missing key")) return;

                            uniqueMessages.push(message);
                            logCount += 1;

                            logError({ source: "tiktokWindowConsole", level, message, line, sourceId, originalUrl: details.url })
                        }
                    });
                }
            });

            mainWindow.webContents.setWindowOpenHandler((details) => {
                try {
                    setTimeout(setHighPriority, 1000);
                } catch (err) { }

                if (details.url.indexOf('https://www.tiktok.com/') === 0 && details.url.includes('#tfbridge')) {
                    return {
                        action: 'allow',
                        overrideBrowserWindowOptions: {
                            show: false || details.url.includes('show=1'),
                            height: randomIntFromInterval(900, 1200),
                            width: randomIntFromInterval(1800, 2300),
                            webPreferences: {
                                preload: path.join(RESSOURCE_DIR, 'bridge.js'),
                                contextIsolation: false,
                                backgroundThrottling: false
                            }
                        }
                    };
                }

                if (details.url.indexOf('https://www.tiktok.com/') === 0 && (details.url.includes('#ttlogin') || details.url.includes('#ttlogout'))) {
                    return {
                        action: 'allow',
                        overrideBrowserWindowOptions: {
                            webPreferences: {
                                preload: path.join(RESSOURCE_DIR, 'closeonredirect.js')
                            },
                            height: randomIntFromInterval(900, 950),
                            width: randomIntFromInterval(750, 850)
                        }
                    };
                }

                if (details.url.includes('#electron')) {
                    let webPreferences = undefined;

                    if (details.url.includes('#fetchhelper')) {
                        webPreferences = {
                            preload: path.join(RESSOURCE_DIR, 'fetchhelper.js'),
                            contextIsolation: false,
                            backgroundThrottling: false
                        };
                    }

                    return {
                        action: 'allow',
                        overrideBrowserWindowOptions: {
                            show: !details.url.includes('#hidden'),
                            webPreferences
                        }
                    };
                }

                if (details.url.indexOf('https://') === 0 || details.url.indexOf('http://') === 0) {
                    shell.openExternal(details.url);
                }

                return { action: 'deny' };
            })
        })

        // ============ Websocker Server ============
        axios.get(`${process.env.TIKFINITY_HOST}/electron/websocketserver.js?v=${new Date().getTime()}`, { timeout: 10000 }).then(mainJsResponse => {
            writeFile(path.join(RESSOURCE_DIR, 'websocketserver.js'), mainJsResponse.data, () => {
                try {
                    require(path.join(RESSOURCE_DIR, 'websocketserver.js'));

                    websocketServer = new process.WebSocketServer({
                        host: '127.0.0.1',
                        port: 21213
                    })

                    websocketServer.on('connection', (ws) => {
                        mainWindow.webContents.send('dapiClientConnected', {});
                    });
                } catch (err) {
                    console.error("WebsocketServer", err);
                }
            });
        }).catch(err => {
            console.error("WebsocketServer", err);
        })

        // ============ Keyboard Listener ==========
        let keyboardListenerInitialized = false;

        function initKeyboardListener() {
            if (!isWindows) {
                console.log("KeyboardListener not initialized, because not Windows");
                return;
            }

            if (keyboardListenerInitialized) return;
            keyboardListenerInitialized = true;

            axios.get(`${process.env.TIKFINITY_HOST}/electron/keyboardlistener.js?v=${new Date().getTime()}`).then(mainJsResponse => {
                writeFile(path.join(RESSOURCE_DIR, 'keyboardlistener.js'), mainJsResponse.data, () => {
                    try {
                        require(path.join(RESSOURCE_DIR, 'keyboardlistener.js'));
                        process.onKeyboardEvent = (event, down) => {
                            mainWindow.webContents.send('keyboardEvent', { event, down });
                        }

                        process.initGlobalKeyboardListener(`${process.env.TIKFINITY_HOST}/electron/TikFinity_KeyboardShortcutListener.exe`, axios, (err) => {
                            console.error("KeyboardListener", err);
                            logError("KeyboardListenerError;" + err.toString());
                        });

                        console.log("KeyboardListener initialized!");
                    } catch (err) {
                        console.error("KeyboardListener", err);
                        logError("KeyboardListenerError;" + err.toString());
                    }
                });
            }).catch(err => {
                console.error("KeyboardListener", err);
                logError("KeyboardListenerError;" + err.toString());
            })
        }


        function setHighPriority() {
            console.log("setHighPriority called!")

            if (!isWindows) {
                console.log("setHighPriority not called, because not Windows");
                return;
            }

            try {
                const command = `wmic process where name="TikFinity.exe" CALL setpriority "high priority"`;

                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        logError(`WMIC_PRIORITY_ERROR ${error} ${stderr}`)
                    } else {
                        logError(`WMIC_PRIORITY_SUCCESS`)
                    }
                });
            } catch (err) {
                logError(`WMIC_PRIORITY_ERROR_2 ${err}`)
            }
        }

        setTimeout(() => {
            setHighPriority();
        }, 5000)

        console.log("main.js loaded!");

        logError("ELECTRON_INIT_SUCCESS");
    } catch (err) {
        logError("ELECTRON_INIT_FAILED;error=" + err.toString());
        setTimeout(() => {
            dialog.showErrorBox('Error', 'Failed to initialize TikFinity Main Process!\n\n' + err.toString());
            app.quit();
        }, 5000);
    }
}