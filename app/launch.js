#!/usr/bin/env node

/**
 * Launch.js - Haupt-Einstiegspunkt für TikTok Stream Tool
 * Startet das Launcher-Modul
 */

const Launcher = require('./modules/launcher');

// Launcher initialisieren und starten
const launcher = new Launcher();

launcher.launch().catch(async (error) => {
    console.error(`Fatal error: ${error.message}`);
    console.error(`Stack trace: ${error.stack}`);
    console.log('\nDrücke eine beliebige Taste zum Beenden...');
    
    // Warte auf Tastendruck bevor das Fenster geschlossen wird
    await launcher.waitForKey();
    process.exit(1);
});
