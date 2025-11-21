
        const { contextBridge, ipcRenderer } = require('electron');

        let newRoomIdHandler = null;
        let isLiveHandler = null;
        let fetchUrlQueue = [];
        let autoItNotInstalledListener = null;

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
            fetchUrl: (requestConfig, callback) => {
                requestConfig.requestId = Math.random() * 10000000000000000;
                requestConfig.action = 'fetchUrl';

                fetchUrlQueue.push({requestId: requestConfig.requestId, callback});

                ipcRenderer.invoke('toMain', requestConfig);
            },
            setAutoItNotInstalledListener: function(func) {
                autoItNotInstalledListener = func;
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

        ipcRenderer.on('isLiveDetected', function (evt, message) {
            console.log("isLiveDetected", message);
            if (isLiveHandler) {
                isLiveHandler.call()
            }
        });

        ipcRenderer.on('fetchUrlResponse', function (evt, message) {
            let fetchUrlQueueItem = fetchUrlQueue.find(x => x.requestId === message.requestId);
            if (fetchUrlQueueItem) {
                fetchUrlQueue.filter(x => x !== fetchUrlQueueItem);
            }
            fetchUrlQueueItem.callback(message);
        });
    