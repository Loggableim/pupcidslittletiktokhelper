const { writeFile } = require('fs');
const { default: axios } = require('axios');
const { app, dialog } = require('electron');
const isDev = require('electron-is-dev');
const path = require('path');

// run this as early in the main process as possible
if (require('electron-squirrel-startup')) {
    app.quit();
} else {
    process.env.TIKFINITY_HOST = isDev ? 'http://localhost:8081' : 'https://tikfinity.zerody.one';
    process.env.TIKFINITY_HOST_FALLBACK = 'http://tikfinity-origin.zerody.one';

    // Update main.js
    let loadMain = (isRetry) => {
        axios.get(`${process.env.TIKFINITY_HOST}/electron/main.js?v=${new Date().getTime()}`).then(mainJsResponse => {
            if (mainJsResponse.status !== 200) {
                dialog.showErrorBox('Server Error', 'Failed to load TikFinity Web Components.\nPlease try again later.\n\nStatus code: ' + mainJsResponse.status);
                return app.quit();
            }
            writeFile(path.join(__dirname, 'main.js'), mainJsResponse.data, () => {
                try {
                    require('./main')();
                } catch (err) {
                    dialog.showErrorBox('JS Error', 'Failed to initialize TikFinity Web Components.\nPlease try again later.\n\n' + err.toString());
                    app.quit();
                }
            });
        }).catch(err => {
            if (isRetry) {
                dialog.showErrorBox('Server not available', 'Failed to load TikFinity Web Components.\nPlease check your internet connection and try again.\n\nHost: ' + process.env.TIKFINITY_HOST + '\n' + (err?.toString() || 'Unknown Error'));
                app.quit();
            } else {
                process.env.TIKFINITY_HOST = process.env.TIKFINITY_HOST_FALLBACK;
                loadMain(true);
            }
        })
    }

    loadMain();

}