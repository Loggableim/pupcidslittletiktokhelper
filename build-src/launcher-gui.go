package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/pkg/browser"
)

// Launcher represents the main launcher application
type Launcher struct {
	nodePath      string
	appDir        string
	exeDir        string
	progress      int
	status        string
	clients       map[chan string]bool
	clientsMux    sync.Mutex
	logFile       *os.File
	logger        *log.Logger
	envFileFixed  bool
	serverCmd     *exec.Cmd
	serverLogs    []string
	serverLogsMux sync.Mutex
	keepOpen      bool
}

// Language represents an available language option
type Language struct {
	Code string `json:"code"`
	Name string `json:"name"`
	Flag string `json:"flag"`
}

// Profile represents a user profile
type Profile struct {
	Username string    `json:"username"`
	Path     string    `json:"path"`
	Created  time.Time `json:"created"`
	Modified time.Time `json:"modified"`
	Size     int64     `json:"size"`
}

// NewLauncher creates a new launcher instance
func NewLauncher() *Launcher {
	return &Launcher{
		status:       "Initializing...",
		progress:     0,
		clients:      make(map[chan string]bool),
		envFileFixed: false,
		serverLogs:   make([]string, 0, 1000),
		keepOpen:     false,
	}
}

// setupLogging creates a log file in the app directory
func (l *Launcher) setupLogging(appDir string) error {
	logDir := filepath.Join(appDir, "logs")
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return fmt.Errorf("failed to create log directory: %v", err)
	}

	timestamp := time.Now().Format("2006-01-02_15-04-05")
	logPath := filepath.Join(logDir, fmt.Sprintf("launcher_%s.log", timestamp))

	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND|os.O_SYNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to create log file: %v", err)
	}

	l.logFile = logFile
	l.logger = log.New(logFile, "", log.LstdFlags)

	l.logger.Println("========================================")
	l.logger.Println("LTTH Launcher - Modern Edition")
	l.logger.Println("========================================")
	l.logger.Printf("Log file: %s\n", logPath)
	l.logger.Printf("Platform: %s\n", runtime.GOOS)
	l.logger.Printf("Architecture: %s\n", runtime.GOARCH)
	l.logger.Println("========================================")

	if err := logFile.Sync(); err != nil {
		return fmt.Errorf("failed to sync log file: %v", err)
	}

	return nil
}

func (l *Launcher) closeLogging() {
	if l.logFile != nil {
		l.logger.Println("========================================")
		l.logger.Println("Launcher finished")
		l.logger.Println("========================================")
		l.logFile.Sync()
		l.logFile.Close()
	}
}

func (l *Launcher) logAndSync(format string, args ...interface{}) {
	if l.logger != nil {
		if len(args) > 0 {
			l.logger.Printf(format, args...)
		} else {
			l.logger.Println(format)
		}
		if l.logFile != nil {
			l.logFile.Sync()
		}
	}
}

func (l *Launcher) addServerLog(line string) {
	l.serverLogsMux.Lock()
	defer l.serverLogsMux.Unlock()

	// Keep only last 1000 lines
	if len(l.serverLogs) >= 1000 {
		l.serverLogs = l.serverLogs[1:]
	}
	l.serverLogs = append(l.serverLogs, line)

	// Broadcast to all clients
	msg := fmt.Sprintf(`{"serverLog": %s}`, escapeJSON(line))
	l.broadcastToClients(msg)
}

func (l *Launcher) updateProgress(value int, status string) {
	l.progress = value
	l.status = status

	msg := fmt.Sprintf(`{"progress": %d, "status": %s}`, value, escapeJSON(status))
	l.broadcastToClients(msg)
}

func (l *Launcher) sendRedirect() {
	msg := `{"redirect": "http://localhost:3000/dashboard.html"}`
	l.broadcastToClients(msg)
}

func (l *Launcher) broadcastToClients(msg string) {
	l.clientsMux.Lock()
	defer l.clientsMux.Unlock()

	for client := range l.clients {
		select {
		case client <- msg:
		default:
		}
	}
}

func (l *Launcher) checkNodeJS() error {
	nodePath, err := exec.LookPath("node")
	if err != nil {
		return fmt.Errorf("Node.js is not installed")
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
	l.logger.Println("[INFO] Starting npm install in background...")
	l.updateProgress(45, "Installing dependencies...")

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", "npm", "install", "--cache", "false")
	} else {
		cmd = exec.Command("npm", "install", "--cache", "false")
	}

	cmd.Dir = l.appDir

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdout pipe: %v", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to create stderr pipe: %v", err)
	}

	if err := cmd.Start(); err != nil {
		l.logger.Printf("[ERROR] Failed to start npm install: %v\n", err)
		return fmt.Errorf("failed to start npm install: %v", err)
	}

	progressCounter := 0
	maxProgress := 75

	// Capture stdout
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			l.logger.Printf("[npm] %s\n", line)
			l.addServerLog(fmt.Sprintf("[npm] %s", line))

			progressCounter++
			currentProgress := 45 + (progressCounter / 2)
			if currentProgress > maxProgress {
				currentProgress = maxProgress
			}

			displayLine := line
			if len(displayLine) > 120 {
				displayLine = displayLine[:117] + "..."
			}
			l.updateProgress(currentProgress, fmt.Sprintf("npm install: %s", displayLine))
		}
	}()

	// Capture stderr
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			l.logger.Printf("[npm stderr] %s\n", line)
			l.addServerLog(fmt.Sprintf("[npm error] %s", line))
		}
	}()

	err = cmd.Wait()
	if err != nil {
		l.logger.Printf("[ERROR] npm install failed: %v\n", err)
		return fmt.Errorf("installation failed: %v", err)
	}

	l.logger.Println("[SUCCESS] npm install completed successfully")
	return nil
}

func (l *Launcher) startTool() (*exec.Cmd, error) {
	launchJS := filepath.Join(l.appDir, "launch.js")
	cmd := exec.Command(l.nodePath, launchJS)
	cmd.Dir = l.appDir

	cmd.Env = append(os.Environ(), "OPEN_BROWSER=false")

	// Capture stdout and stderr for real-time logging
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}

	l.logAndSync("Starting Node.js server...")
	l.logAndSync("Command: %s %s", l.nodePath, launchJS)
	l.logAndSync("Working directory: %s", l.appDir)

	err = cmd.Start()
	if err != nil {
		return nil, err
	}

	// Capture server logs in real-time
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			l.logAndSync("[Server] %s", line)
			l.addServerLog(line)
		}
	}()

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			l.logAndSync("[Server Error] %s", line)
			l.addServerLog(fmt.Sprintf("[ERROR] %s", line))
		}
	}()

	l.serverCmd = cmd
	return cmd, nil
}

func (l *Launcher) checkServerHealth() bool {
	return l.checkServerHealthOnPort(3000)
}

func (l *Launcher) checkServerHealthOnPort(port int) bool {
	client := &http.Client{Timeout: 2 * time.Second}
	url := fmt.Sprintf("http://localhost:%d/dashboard.html", port)
	resp, err := client.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

func (l *Launcher) autoFixEnvFile() error {
	envPath := filepath.Join(l.appDir, ".env")
	envExamplePath := filepath.Join(l.appDir, ".env.example")

	if _, err := os.Stat(envPath); err == nil {
		l.logger.Println("[INFO] .env file already exists")
		return nil
	}

	if _, err := os.Stat(envExamplePath); os.IsNotExist(err) {
		l.logger.Println("[WARNING] .env.example not found")
		return fmt.Errorf(".env.example not found")
	}

	l.logger.Println("[AUTO-FIX] Creating .env from .env.example...")
	l.updateProgress(85, "Creating .env file...")

	input, err := os.ReadFile(envExamplePath)
	if err != nil {
		return err
	}

	err = os.WriteFile(envPath, input, 0644)
	if err != nil {
		return err
	}

	l.logger.Println("[SUCCESS] .env file created")
	l.envFileFixed = true
	return nil
}

func (l *Launcher) runLauncher() {
	time.Sleep(1 * time.Second)

	l.updateProgress(0, "Checking Node.js installation...")
	l.logAndSync("[Phase 1] Checking Node.js...")

	err := l.checkNodeJS()
	if err != nil {
		l.logAndSync("[ERROR] %v", err)
		l.updateProgress(0, "ERROR: Node.js not installed!")
		time.Sleep(10 * time.Second)
		os.Exit(1)
	}

	l.updateProgress(10, "Node.js found...")
	l.logAndSync("[SUCCESS] Node.js: %s", l.getNodeVersion())

	l.updateProgress(25, "Checking app directory...")
	if _, err := os.Stat(l.appDir); os.IsNotExist(err) {
		l.logAndSync("[ERROR] App directory not found: %s", l.appDir)
		l.updateProgress(25, "ERROR: App directory not found")
		time.Sleep(10 * time.Second)
		os.Exit(1)
	}

	l.updateProgress(30, "Checking dependencies...")
	if !l.checkNodeModules() {
		l.updateProgress(40, "Installing dependencies (this may take several minutes)...")
		if err := l.installDependencies(); err != nil {
			l.logAndSync("[ERROR] %v", err)
			l.updateProgress(40, fmt.Sprintf("ERROR: %v", err))
			time.Sleep(10 * time.Second)
			os.Exit(1)
		}
		l.updateProgress(80, "Dependencies installed!")
	} else {
		l.updateProgress(80, "Dependencies already installed")
	}

	l.updateProgress(85, "Checking configuration...")
	l.autoFixEnvFile()

	l.updateProgress(90, "Starting server...")
	cmd, err := l.startTool()
	if err != nil {
		l.logAndSync("[ERROR] Failed to start server: %v", err)
		l.updateProgress(90, "ERROR: Server failed to start")
		time.Sleep(10 * time.Second)
		os.Exit(1)
	}

	// Monitor process
	processDied := make(chan error, 1)
	go func() {
		processDied <- cmd.Wait()
	}()

	l.updateProgress(95, "Waiting for server to start...")
	
	// Wait for server health check
	healthCheckTimeout := time.After(60 * time.Second)
	healthCheckTicker := time.NewTicker(1 * time.Second)
	defer healthCheckTicker.Stop()

	serverReady := false
	for !serverReady {
		select {
		case err := <-processDied:
			l.logAndSync("[ERROR] Server exited prematurely: %v", err)
			l.updateProgress(95, "ERROR: Server crashed")
			time.Sleep(15 * time.Second)
			os.Exit(1)
		case <-healthCheckTicker.C:
			if l.checkServerHealth() {
				serverReady = true
			}
		case <-healthCheckTimeout:
			l.logAndSync("[ERROR] Server health check timeout")
			l.updateProgress(95, "ERROR: Server timeout")
			time.Sleep(15 * time.Second)
			os.Exit(1)
		}
	}

	l.updateProgress(100, "Server ready!")
	l.logger.Println("[SUCCESS] Server is running!")
	time.Sleep(500 * time.Millisecond)
	l.sendRedirect()

	// Keep running if keepOpen is enabled
	if l.keepOpen {
		l.logger.Println("[INFO] Launcher kept open")
		select {}
	} else {
		time.Sleep(3 * time.Second)
		l.closeLogging()
		os.Exit(0)
	}
}

func escapeJSON(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

func main() {
	launcher := NewLauncher()

	exePath, err := os.Executable()
	if err != nil {
		log.Fatal("Cannot determine executable directory:", err)
	}

	launcher.exeDir = filepath.Dir(exePath)
	launcher.appDir = filepath.Join(launcher.exeDir, "app")

	if err := launcher.setupLogging(launcher.appDir); err != nil {
		launcher.logger = log.New(io.Discard, "", log.LstdFlags)
	}

	launcher.logAndSync("LTTH Launcher started")
	launcher.logAndSync("Exe directory: %s", launcher.exeDir)
	launcher.logAndSync("App directory: %s", launcher.appDir)

	// Setup HTTP server with all routes
	setupHTTPServer(launcher)

	// Start HTTP server
	go func() {
		launcher.logAndSync("Starting HTTP server on :58734")
		if err := http.ListenAndServe("127.0.0.1:58734", nil); err != nil {
			log.Fatal(err)
		}
	}()

	time.Sleep(500 * time.Millisecond)

	// Open browser
	browser.OpenURL("http://127.0.0.1:58734")

	// Run launcher
	go launcher.runLauncher()

	// Keep running
	select {}
}
