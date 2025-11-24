// +build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"

	"github.com/lxn/walk"
	. "github.com/lxn/walk/declarative"
)

type LauncherWindow struct {
	*walk.MainWindow
	progressBar *walk.ProgressBar
	statusLabel *walk.Label
	nodePath    string
	appDir      string
}

func main() {
	launcher := &LauncherWindow{}
	
	// Get executable directory and app directory
	exePath, err := os.Executable()
	if err != nil {
		walk.MsgBox(nil, "Fehler", fmt.Sprintf("Kann Programmverzeichnis nicht ermitteln: %v", err), walk.MsgBoxIconError)
		os.Exit(1)
	}
	
	exeDir := filepath.Dir(exePath)
	launcher.appDir = filepath.Join(exeDir, "app")
	bgImagePath := filepath.Join(launcher.appDir, "launcherbg.png")
	
	// Load background image for icon
	var bgIcon *walk.Icon
	if _, err := os.Stat(bgImagePath); err == nil {
		if bmp, err := walk.NewBitmapFromFile(bgImagePath); err == nil {
			bgIcon, _ = walk.NewIconFromBitmap(bmp)
		}
	}
	
	// Create main window - simple layout without nested composites to avoid TTM_ADDTOOL error
	if err := (MainWindow{
		AssignTo: &launcher.MainWindow,
		Title:    "TikTok Stream Tool - Launcher",
		Icon:     bgIcon,
		Size:     Size{Width: 600, Height: 200},
		Layout:   VBox{Margins: Margins{Left: 20, Top: 20, Right: 20, Bottom: 20}},
		Children: []Widget{
			VSpacer{},
			Label{
				AssignTo: &launcher.statusLabel,
				Text:     "Initialisiere...",
				Font:     Font{PointSize: 11, Bold: true},
			},
			ProgressBar{
				AssignTo: &launcher.progressBar,
				MinValue: 0,
				MaxValue: 100,
				Value:    0,
			},
			VSpacer{},
		},
	}.Create()); err != nil {
		walk.MsgBox(nil, "Fehler", fmt.Sprintf("Fehler beim Erstellen des Fensters: %v", err), walk.MsgBoxIconError)
		os.Exit(1)
	}
	
	// Start launcher process
	go launcher.runLauncher()
	
	launcher.Run()
}

func (lw *LauncherWindow) updateProgress(value int, status string) {
	lw.Synchronize(func() {
		lw.progressBar.SetValue(value)
		lw.statusLabel.SetText(status)
	})
}

func (lw *LauncherWindow) showError(title, message string) {
	lw.Synchronize(func() {
		walk.MsgBox(lw, title, message, walk.MsgBoxIconError)
	})
}

func (lw *LauncherWindow) checkNodeJS() error {
	nodePath, err := exec.LookPath("node")
	if err != nil {
		return fmt.Errorf("Node.js ist nicht installiert")
	}
	lw.nodePath = nodePath
	return nil
}

func (lw *LauncherWindow) getNodeVersion() string {
	cmd := exec.Command(lw.nodePath, "--version")
	output, err := cmd.Output()
	if err != nil {
		return "unknown"
	}
	return string(output)
}

func (lw *LauncherWindow) checkNodeModules() bool {
	nodeModulesPath := filepath.Join(lw.appDir, "node_modules")
	info, err := os.Stat(nodeModulesPath)
	if err != nil {
		return false
	}
	return info.IsDir()
}

func (lw *LauncherWindow) installDependencies() error {
	cmd := exec.Command("cmd", "/C", "npm", "install")
	cmd.Dir = lw.appDir
	
	// Hide console window for npm install
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
	
	err := cmd.Run()
	if err != nil {
		return fmt.Errorf("Installation fehlgeschlagen: %v", err)
	}
	
	return nil
}

func (lw *LauncherWindow) startTool() error {
	launchJS := filepath.Join(lw.appDir, "launch.js")
	cmd := exec.Command(lw.nodePath, launchJS)
	cmd.Dir = lw.appDir
	
	// Start the process detached
	return cmd.Start()
}

func (lw *LauncherWindow) runLauncher() {
	// Phase 1: Check Node.js (0-20%)
	lw.updateProgress(0, "Prüfe Node.js Installation...")
	
	err := lw.checkNodeJS()
	if err != nil {
		lw.updateProgress(0, "FEHLER: Node.js ist nicht installiert!")
		lw.showError("Fehler", "Node.js ist nicht installiert!\n\nBitte installiere Node.js von:\nhttps://nodejs.org\n\nEmpfohlen: LTS Version 18 oder 20")
		os.Exit(1)
	}
	
	lw.updateProgress(10, "Node.js gefunden...")
	
	version := lw.getNodeVersion()
	lw.updateProgress(20, fmt.Sprintf("Node.js Version: %s", version))
	
	// Phase 2: Find directories (20-30%)
	lw.updateProgress(25, "Prüfe App-Verzeichnis...")
	
	if _, err := os.Stat(lw.appDir); os.IsNotExist(err) {
		lw.updateProgress(25, "FEHLER: app Verzeichnis nicht gefunden")
		lw.showError("Fehler", fmt.Sprintf("app Verzeichnis nicht gefunden in %s", filepath.Dir(lw.appDir)))
		os.Exit(1)
	}
	
	lw.updateProgress(30, "App-Verzeichnis gefunden...")
	
	// Phase 3: Check and install dependencies (30-80%)
	lw.updateProgress(30, "Prüfe Abhängigkeiten...")
	
	if !lw.checkNodeModules() {
		lw.updateProgress(40, "Installiere Abhängigkeiten...")
		lw.updateProgress(45, "Dies kann beim ersten Start einige Minuten dauern...")
		
		err = lw.installDependencies()
		if err != nil {
			lw.updateProgress(45, fmt.Sprintf("FEHLER: %v", err))
			lw.showError("Fehler", fmt.Sprintf("Installation fehlgeschlagen: %v", err))
			os.Exit(1)
		}
		
		lw.updateProgress(80, "Installation abgeschlossen!")
	} else {
		lw.updateProgress(80, "Abhängigkeiten bereits installiert...")
	}
	
	// Phase 4: Start tool (80-100%)
	lw.updateProgress(90, "Starte Tool...")
	lw.updateProgress(100, "Tool wird gestartet...")
	
	// Start the tool
	err = lw.startTool()
	if err != nil {
		lw.showError("Fehler", fmt.Sprintf("Fehler beim Starten: %v", err))
		os.Exit(1)
	}
	
	// Close the launcher window
	lw.Synchronize(func() {
		lw.Close()
	})
}
