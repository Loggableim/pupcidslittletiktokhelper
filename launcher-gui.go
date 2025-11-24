package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
)

const (
	colorReset  = "\033[0m"
	colorCyan   = "\033[36m"
	colorGreen  = "\033[32m"
	colorYellow = "\033[33m"
	colorRed    = "\033[31m"
	colorBold   = "\033[1m"
)

type Launcher struct {
	nodePath string
	appDir   string
}

func NewLauncher() *Launcher {
	return &Launcher{}
}

func (l *Launcher) printHeader() {
	fmt.Println(colorCyan + colorBold)
	fmt.Println("╔════════════════════════════════════════════════════╗")
	fmt.Println("║     TikTok Stream Tool - Grafischer Launcher      ║")
	fmt.Println("╚════════════════════════════════════════════════════╝")
	fmt.Println(colorReset)
}

func (l *Launcher) drawProgressBar(percent int, status string) {
	barWidth := 50
	filled := int(float64(barWidth) * float64(percent) / 100.0)
	empty := barWidth - filled
	
	bar := strings.Repeat("█", filled) + strings.Repeat("░", empty)
	
	// Clear previous lines
	fmt.Print("\033[2K\r") // Clear current line
	fmt.Print("\033[1A\033[2K\r") // Move up and clear
	fmt.Print("\033[1A\033[2K\r") // Move up and clear
	
	// Print status
	fmt.Printf("%s%s%s\n", colorBold, status, colorReset)
	
	// Print progress bar
	if percent < 50 {
		fmt.Printf("[%s%s%s] %3d%%\n", colorYellow, bar, colorReset, percent)
	} else if percent < 100 {
		fmt.Printf("[%s%s%s] %3d%%\n", colorCyan, bar, colorReset, percent)
	} else {
		fmt.Printf("[%s%s%s] %3d%%\n", colorGreen, bar, colorReset, percent)
	}
	fmt.Println()
}

func (l *Launcher) checkNodeJS() error {
	nodePath, err := exec.LookPath("node")
	if err != nil {
		return fmt.Errorf("Node.js ist nicht installiert")
	}
	l.nodePath = nodePath
	return nil
}

func (l *Launcher) getNodeVersion() string {
	cmd := exec.Command(l.nodePath, "--version")
	output, err := cmd.Output()
	if err != nil {
		return "unknown"
	}
	return strings.TrimSpace(string(output))
}

func (l *Launcher) checkNodeModules() bool {
	nodeModulesPath := filepath.Join(l.appDir, "node_modules")
	info, err := os.Stat(nodeModulesPath)
	if err != nil {
		return false
	}
	return info.IsDir()
}

func (l *Launcher) installDependencies() error {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", "npm", "install")
	} else {
		cmd = exec.Command("npm", "install")
	}
	
	cmd.Dir = l.appDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	
	err := cmd.Run()
	if err != nil {
		return fmt.Errorf("Installation fehlgeschlagen: %v", err)
	}
	
	return nil
}

func (l *Launcher) startTool() error {
	launchJS := filepath.Join(l.appDir, "launch.js")
	cmd := exec.Command(l.nodePath, launchJS)
	cmd.Dir = l.appDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	
	return cmd.Run()
}

func (l *Launcher) run() error {
	// Initial spacing
	fmt.Println("\n\n")
	
	// Phase 1: Check Node.js (0-20%)
	l.drawProgressBar(0, "Prüfe Node.js Installation...")
	
	err := l.checkNodeJS()
	if err != nil {
		l.drawProgressBar(0, colorRed+"FEHLER: Node.js ist nicht installiert!"+colorReset)
		fmt.Println()
		fmt.Println(colorYellow + "Bitte installiere Node.js von:" + colorReset)
		fmt.Println("https://nodejs.org")
		fmt.Println()
		fmt.Println(colorYellow + "Empfohlen: Node.js LTS Version 18 oder 20" + colorReset)
		fmt.Println()
		return err
	}
	
	l.drawProgressBar(10, "Node.js gefunden...")
	
	version := l.getNodeVersion()
	l.drawProgressBar(20, fmt.Sprintf("Node.js Version: %s", version))
	
	// Phase 2: Find directories (20-30%)
	l.drawProgressBar(25, "Prüfe App-Verzeichnis...")
	
	if _, err := os.Stat(l.appDir); os.IsNotExist(err) {
		l.drawProgressBar(25, colorRed+"FEHLER: app Verzeichnis nicht gefunden"+colorReset)
		fmt.Println()
		fmt.Printf("%sApp-Verzeichnis erwartet in: %s%s\n", colorYellow, l.appDir, colorReset)
		fmt.Println()
		return err
	}
	
	l.drawProgressBar(30, "App-Verzeichnis gefunden...")
	
	// Phase 3: Check and install dependencies (30-80%)
	l.drawProgressBar(30, "Prüfe Abhängigkeiten...")
	
	if !l.checkNodeModules() {
		l.drawProgressBar(40, "Installiere Abhängigkeiten...")
		l.drawProgressBar(45, "Dies kann beim ersten Start einige Minuten dauern...")
		
		err = l.installDependencies()
		if err != nil {
			l.drawProgressBar(45, colorRed+fmt.Sprintf("FEHLER: %v", err)+colorReset)
			fmt.Println()
			return err
		}
		
		l.drawProgressBar(80, "Installation abgeschlossen!")
	} else {
		l.drawProgressBar(80, "Abhängigkeiten bereits installiert...")
	}
	
	// Phase 4: Start tool (80-100%)
	l.drawProgressBar(90, "Starte Tool...")
	l.drawProgressBar(100, colorGreen+"Tool wird gestartet..."+colorReset)
	
	fmt.Println()
	fmt.Println(colorCyan + "═══════════════════════════════════════════════════" + colorReset)
	fmt.Println()
	
	// Start the tool
	return l.startTool()
}

func main() {
	// Enable ANSI color support on Windows 10+
	if runtime.GOOS == "windows" {
		kernel32 := syscall.NewLazyDLL("kernel32.dll")
		setConsoleMode := kernel32.NewProc("SetConsoleMode")
		getStdHandle := kernel32.NewProc("GetStdHandle")
		
		handle, _, _ := getStdHandle.Call(uintptr(^uint32(10))) // STD_OUTPUT_HANDLE (-11 as unsigned)
		setConsoleMode.Call(handle, 0x0001|0x0002|0x0004)      // ENABLE_PROCESSED_OUTPUT | ENABLE_WRAP_AT_EOL_OUTPUT | ENABLE_VIRTUAL_TERMINAL_PROCESSING
	}
	
	launcher := NewLauncher()
	
	// Get executable directory
	exePath, err := os.Executable()
	if err != nil {
		fmt.Printf("%sFehler: Kann Programmverzeichnis nicht ermitteln: %v%s\n", colorRed, err, colorReset)
		pause()
		os.Exit(1)
	}
	
	exeDir := filepath.Dir(exePath)
	launcher.appDir = filepath.Join(exeDir, "app")
	
	// Print header
	launcher.printHeader()
	
	// Run launcher
	err = launcher.run()
	if err != nil {
		pause()
		os.Exit(1)
	}
}

func pause() {
	fmt.Println()
	fmt.Print("Drücke Enter zum Beenden...")
	fmt.Scanln()
}
