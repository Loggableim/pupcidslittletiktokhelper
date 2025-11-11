#!/usr/bin/env node

/**
 * Launch.js - Haupt-Einstiegspunkt für Pup Cid´s Little Tiktok Helper
 * Startet das Launcher-Modul
 */

const Launcher = require('./modules/launcher');

// Launcher initialisieren und starten
const launcher = new Launcher();

launcher.launch().catch((error) => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
});
