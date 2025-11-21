module.exports = {
  packagerConfig: {
    name: 'TikFinity',
    productName: 'TikFinity',
    icon: './resources/tikfinity.ico',
    ignore: [
      "^/browser_profile"
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        setupIcon: './resources/install_icon.ico',
        loadingGif: './resources/install_splash.gif',
        iconUrl: 'https://tikfinity.zerody.one/img/tikfinity.ico',
        setupExe: 'TikFinity_installer.exe'
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
};
