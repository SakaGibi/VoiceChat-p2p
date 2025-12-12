const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 650,
        height: 800,
        minWidth: 300,
        minHeight: 500,
        title: "Natla",
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'app/assets/gazmaliyim.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false,
            nodeIntegration: true, 
            contextIsolation: false,
            enableRemoteModule: false
        }
    });

    win.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
