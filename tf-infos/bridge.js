// ==UserScript==
// @name         TikTok Live Bridge
// @namespace    https://tikfinity.zerody.one/
// @version      0.6
// @description  Script to route events from TikTok LIVE to TikFinity.
// @author       Zerody
// @match        https://www.tiktok.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=tiktok.com
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // Hotfix for ABTest error "data: [] is not a valid JSON" in indonesia and malaysia
    if (!localStorage.getItem('multi-account-info')) localStorage.setItem('multi-account-info', '[]');

    if (!window.opener) {
        console.info('window has no opener, skipping script execution...');
        return;
    }

    if (location.hash !== "#tfbridge") {
        console.info('hash not set, skipping script execution...');
        return;
    }

    function callback(type, info, binary) {
        console.info("CALLBACK", type);

        try {
            window.opener.postMessage({
                app: 'tfbridge',
                type,
                info,
                binary
            }, '*')
        } catch (err) {
            console.error(err);
        }
    }

    function checkLiveEnd() {
        if (document.querySelector('[class*="LiveEndContainer"]') !== null) {
            callback('liveEnd', {});
        }
    }

    function muteVideoAndAudio() {
        document.querySelectorAll("video, audio").forEach(elem => {
            elem.muted = true;
            elem.pause();
        });
    }

    function addBanner() {
        if (document.querySelector('#tfbanner') === null) {
            let banner = document.createElement('div');
            banner.id = "tfbanner";
            banner.innerHTML = 'Leave this page open while you are live! You can go back to the <b>TikFinity</b> tab.<br><small>Video/Audio does not work here.</small><br><div style="font-size: 0.5em" id="tfbannerNotice"></div>'
            banner.style.position = "absolute";
            banner.style.top = "0";
            banner.style.left = "0";
            banner.style.width = "100%";
            banner.style.padding = "5px";
            banner.style.color = "#fff";
            banner.style.background = "rgb(156, 64, 58)";
            banner.style["z-index"] = "9999";
            banner.style["font-size"] = "1.7em";
            banner.style["text-align"] = "center";

            document.body.appendChild(banner);
        }
    }

    function parseRoomInfoFromHtml(throwError) {
        if (roomInfoProcessed) {
            return;
        }

        try {
            let sigiStateJson = document.getElementById('SIGI_STATE')?.innerText;

            if (!sigiStateJson) {
                if (throwError) {
                    callback("errorAlert", "Error in parseRoomInfoFromHtml(): sigiStateJson not found!");
                }

                return callback("log", "sigiStateJson not found!");
            }

            let pageInfo = JSON.parse(sigiStateJson);

            roomId = pageInfo?.LiveRoom?.liveRoomUserInfo?.user?.roomId || "unknown";

            if (roomId === "unknown") {
                callback("log", "roomId not detected!");
            }

            if (!pageInfo?.AppContext?.appContext?.user?.uid) {
                return callback('noLogin');
            }

            roomInfoProcessed = true;
            callback('roomInfo', pageInfo?.LiveRoom);
            callback("log", "sigiStateJson processed!");
        } catch (err) {
            callback("errorAlert", "Error in parseRoomInfoFromHtml(): " + err.toString());
        }
    }

    // Backup native functions
    let nativeXhrOpen = window.XMLHttpRequest.prototype.open;
    let nativeWebSocket = window.WebSocket;
    let nativeResponseJson = window.Response.prototype.json;

    let roomInfoProcessed = false;
    let roomId = "";

    // Intercept initial fetch data
    window.XMLHttpRequest.prototype.open = function (method, url) {
        if (url && url.includes('/webcast/im/fetch') && url.includes(roomId) && url.includes('msToken')) {
            this.addEventListener('readystatechange', () => {
                if (this.readyState === 4) {
                    callback('fetch', null, this.response);
                }
            })
        }

        return nativeXhrOpen.apply(this, arguments);
    }

    window.WebSocket = function (url, protocols) {
        let ws = new (Function.prototype.bind.call(nativeWebSocket, null, url, protocols));

        if (url && url.includes('/webcast/im/push') && url.includes(roomId)) {
            ws.addEventListener('message', function (msg) {
                callback('push', null, msg.data);
            })

            ws.addEventListener('close', () => {
                callback('wsClosed');
            })
        }

        return ws;
    }

    window.Response.prototype.json = function () {
        return new Promise((resolve, reject) => {
            nativeResponseJson.apply(this).then(json => {
                resolve(json);

                if (json?.data?.liveRoom?.streamId && !roomInfoProcessed) {
                    roomInfoProcessed = true;
                    roomId = json?.data?.user?.roomId || "unknown";

                    if (roomId === "unknown") {
                        callback("log", "roomId not detected!");
                    }

                    callback('roomInfo', { liveRoomUserInfo: json.data, liveRoomStatus: json.data.liveRoom?.status });
                    callback("log", "api-live processed!");
                }
            }).catch(reject);
        })
    };

    window.addEventListener('DOMContentLoaded', () => {
        addBanner();
        parseRoomInfoFromHtml();
    })

    parseRoomInfoFromHtml();
    setTimeout(parseRoomInfoFromHtml, 0);
    setTimeout(parseRoomInfoFromHtml, 1);
    setTimeout(parseRoomInfoFromHtml, 10);
    setTimeout(parseRoomInfoFromHtml, 100);
    setTimeout(() => parseRoomInfoFromHtml(true), 15000);

    let wafReloadTriggered = false;
    let nativeReload = window.location.reload;

    try {
        window.location.reload = function () {
            wafReloadTriggered = true;
            nativeReload();
        }
    } catch (err) { }

    window.addEventListener('beforeunload', () => {
        if (!wafReloadTriggered) {
            callback('closed', {});
        }
    });

    setInterval(checkLiveEnd, 1000);
    setInterval(muteVideoAndAudio, 1000);

    window.addEventListener('message', (e) => {
        checkLiveEnd();

        if (typeof e.data === "object" && e.data) {
            switch (e.data.cmd) {
                case "sendChatMsg": {
                    console.info("sendChatMsg", e.data);

                    if (!window.location.pathname.startsWith('/@' + e.data.destinationUserHandle)) {
                        document.getElementById("tfbannerNotice").innerText = 'Error: destinationUserHandle does not match!';
                        return console.error('destinationUserHandle does not match!');
                    }

                    let inputElement = document.querySelector('[data-e2e="comment-input"]')?.querySelector('[contenteditable="true"]');
                    if (!inputElement) {
                        document.getElementById("tfbannerNotice").innerText = 'Error: comment-input field not found!';
                        return console.error('comment-input field not found!');
                    }

                    inputElement.innerText = e.data.messageText;
                    inputElement.dispatchEvent(new KeyboardEvent('keydown', {
                        bubbles: true, cancelable: true, keyCode: 13, code: 'Enter'
                    }));

                    document.getElementById("tfbannerNotice").innerText = 'Last Message: ' + e.data.messageText;

                    break;
                }
            }
        }
    });

    callback('hello', null);
})();