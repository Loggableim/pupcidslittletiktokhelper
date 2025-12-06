package main

import (
	"bufio"
	"fmt"
	"html/template"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"github.com/pkg/browser"
)

type Launcher struct {
	nodePath     string
	appDir       string
	progress     int
	status       string
	clients      map[chan string]bool
	logFile      *os.File
	logger       *log.Logger
	envFileFixed bool // Track if we auto-created .env file
}

func NewLauncher() *Launcher {
	return &Launcher{
		status:       "Initialisiere...",
		progress:     0,
		clients:      make(map[chan string]bool),
		envFileFixed: false,
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

	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return fmt.Errorf("failed to create log file: %v", err)
	}

	l.logFile = logFile

	// Create multi-writer to write to both file and stdout
	multiWriter := io.MultiWriter(os.Stdout, logFile)
	l.logger = log.New(multiWriter, "", log.LstdFlags)

	l.logger.Println("========================================")
	l.logger.Println("TikTok Stream Tool - Launcher Log")
	l.logger.Println("========================================")
	l.logger.Printf("Log file: %s\n", logPath)
	l.logger.Printf("Platform: %s\n", runtime.GOOS)
	l.logger.Printf("Architecture: %s\n", runtime.GOARCH)
	l.logger.Println("========================================")

	return nil
}

// closeLogging closes the log file
func (l *Launcher) closeLogging() {
	if l.logFile != nil {
		l.logger.Println("========================================")
		l.logger.Println("Launcher finished")
		l.logger.Println("========================================")
		l.logFile.Close()
	}
}

func (l *Launcher) updateProgress(value int, status string) {
	l.progress = value
	l.status = status

	msg := fmt.Sprintf(`{"progress": %d, "status": "%s"}`, value, status)
	for client := range l.clients {
		select {
		case client <- msg:
		default:
		}
	}
}

func (l *Launcher) sendRedirect() {
	msg := `{"redirect": "http://localhost:3000/dashboard.html"}`
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
	return string(output)
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
	l.logger.Println("[INFO] Starting npm install...")
	l.updateProgress(45, "npm install wird gestartet...")
	time.Sleep(500 * time.Millisecond)
	
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", "npm", "install", "--cache", "false")
	} else {
		cmd = exec.Command("npm", "install", "--cache", "false")
	}
	
	cmd.Dir = l.appDir
	
	// Capture output for logging and progress updates
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("Failed to create stdout pipe: %v", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("Failed to create stderr pipe: %v", err)
	}
	
	// Start the command
	if err := cmd.Start(); err != nil {
		l.logger.Printf("[ERROR] Failed to start npm install: %v\n", err)
		return fmt.Errorf("Failed to start npm install: %v", err)
	}
	
	// Track progress with live updates
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			l.logger.Printf("[npm stdout] %s\n", line)
			// Show progress in UI
			if len(line) > 0 {
				// Truncate long lines for display
				displayLine := line
				if len(displayLine) > 60 {
					displayLine = displayLine[:57] + "..."
				}
				l.updateProgress(50, fmt.Sprintf("npm: %s", displayLine))
			}
		}
	}()
	
	// Log errors
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			l.logger.Printf("[npm stderr] %s\n", line)
		}
	}()
	
	// Wait for command to complete
	err = cmd.Wait()
	if err != nil {
		l.logger.Printf("[ERROR] npm install failed: %v\n", err)
		return fmt.Errorf("Installation fehlgeschlagen: %v", err)
	}
	
	l.logger.Println("[SUCCESS] npm install completed successfully")
	return nil
}

func (l *Launcher) startTool() (*exec.Cmd, error) {
	launchJS := filepath.Join(l.appDir, "launch.js")
	cmd := exec.Command(l.nodePath, launchJS)
	cmd.Dir = l.appDir

	// Redirect both stdout and stderr to log file and console
	if l.logFile != nil {
		multiWriter := io.MultiWriter(os.Stdout, l.logFile)
		cmd.Stdout = multiWriter
		cmd.Stderr = multiWriter
	} else {
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
	}
	cmd.Stdin = os.Stdin

	l.logger.Println("Starting Node.js server...")
	l.logger.Printf("Command: %s %s\n", l.nodePath, launchJS)
	l.logger.Printf("Working directory: %s\n", l.appDir)

	err := cmd.Start()
	if err != nil {
		return nil, err
	}

	return cmd, nil
}

// checkServerHealth checks if the server is responding
func (l *Launcher) checkServerHealth() bool {
	return l.checkServerHealthOnPort(3000)
}

// checkServerHealthOnPort checks if the server is responding on a specific port
func (l *Launcher) checkServerHealthOnPort(port int) bool {
	client := &http.Client{
		Timeout: 2 * time.Second,
	}

	url := fmt.Sprintf("http://localhost:%d/dashboard.html", port)
	resp, err := client.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode == 200
}

// waitForServer waits for the server to be ready or timeout
func (l *Launcher) waitForServer(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		if l.checkServerHealth() {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}

	return fmt.Errorf("Server did not start within %v", timeout)
}

// autoFixEnvFile checks if .env exists and creates it from .env.example if missing
func (l *Launcher) autoFixEnvFile() error {
	envPath := filepath.Join(l.appDir, ".env")
	envExamplePath := filepath.Join(l.appDir, ".env.example")
	
	// Check if .env already exists
	if _, err := os.Stat(envPath); err == nil {
		l.logger.Println("[INFO] .env file already exists")
		return nil
	}
	
	// Check if .env.example exists
	if _, err := os.Stat(envExamplePath); os.IsNotExist(err) {
		l.logger.Println("[WARNING] .env.example not found, cannot auto-create .env")
		return fmt.Errorf(".env.example not found")
	}
	
	l.logger.Println("[AUTO-FIX] Creating .env from .env.example...")
	l.updateProgress(85, "🔧 Auto-Fix: Erstelle .env Datei...")
	
	// Read .env.example
	input, err := os.ReadFile(envExamplePath)
	if err != nil {
		l.logger.Printf("[ERROR] Failed to read .env.example: %v\n", err)
		return err
	}
	
	// Write to .env
	err = os.WriteFile(envPath, input, 0644)
	if err != nil {
		l.logger.Printf("[ERROR] Failed to write .env: %v\n", err)
		return err
	}
	
	l.logger.Println("[SUCCESS] .env file created successfully")
	l.updateProgress(86, "✅ .env Datei erstellt!")
	l.envFileFixed = true // Mark that we fixed the .env file
	time.Sleep(1 * time.Second)
	
	return nil
}

// checkPortAvailable checks if a port is available
func (l *Launcher) checkPortAvailable(port int) bool {
	address := fmt.Sprintf("localhost:%d", port)
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return false
	}
	listener.Close()
	return true
}

// autoFixPort checks if port 3000 is available and logs status
func (l *Launcher) autoFixPort() {
	l.logger.Println("[INFO] Checking if port 3000 is available...")
	
	if l.checkPortAvailable(3000) {
		l.logger.Println("[SUCCESS] Port 3000 is available")
		return
	}
	
	l.logger.Println("[WARNING] Port 3000 is already in use")
	l.updateProgress(87, "⚠️ Port 3000 belegt - Server wird alternativen Port nutzen")
	time.Sleep(2 * time.Second)
	
	// Check if server is already running on 3000
	if l.checkServerHealthOnPort(3000) {
		l.logger.Println("[INFO] Server is already running on port 3000")
		l.updateProgress(88, "ℹ️ Server läuft bereits auf Port 3000")
		time.Sleep(2 * time.Second)
	}
}

func (l *Launcher) runLauncher() {
	time.Sleep(1 * time.Second) // Give browser time to load

	// Phase 1: Check Node.js (0-20%)
	l.updateProgress(0, "Prüfe Node.js Installation...")
	l.logger.Println("[Phase 1] Checking Node.js installation...")
	time.Sleep(500 * time.Millisecond)

	err := l.checkNodeJS()
	if err != nil {
		l.logger.Printf("[ERROR] Node.js check failed: %v\n", err)
		l.updateProgress(0, "FEHLER: Node.js ist nicht installiert!")
		time.Sleep(5 * time.Second)
		l.closeLogging()
		os.Exit(1)
	}

	l.updateProgress(10, "Node.js gefunden...")
	l.logger.Printf("[SUCCESS] Node.js found at: %s\n", l.nodePath)
	time.Sleep(300 * time.Millisecond)

	version := l.getNodeVersion()
	l.updateProgress(20, fmt.Sprintf("Node.js Version: %s", version))
	l.logger.Printf("[INFO] Node.js version: %s\n", version)
	time.Sleep(300 * time.Millisecond)

	// Phase 2: Find directories (20-30%)
	l.updateProgress(25, "Prüfe App-Verzeichnis...")
	l.logger.Printf("[Phase 2] Checking app directory: %s\n", l.appDir)
	time.Sleep(300 * time.Millisecond)

	if _, err := os.Stat(l.appDir); os.IsNotExist(err) {
		l.logger.Printf("[ERROR] App directory not found: %s\n", l.appDir)
		l.updateProgress(25, "FEHLER: app Verzeichnis nicht gefunden")
		time.Sleep(5 * time.Second)
		l.closeLogging()
		os.Exit(1)
	}

	l.updateProgress(30, "App-Verzeichnis gefunden...")
	l.logger.Printf("[SUCCESS] App directory exists: %s\n", l.appDir)
	time.Sleep(300 * time.Millisecond)

	// Phase 3: Check and install dependencies (30-80%)
	l.updateProgress(30, "Prüfe Abhängigkeiten...")
	l.logger.Println("[Phase 3] Checking dependencies...")
	time.Sleep(300 * time.Millisecond)

	if !l.checkNodeModules() {
		l.updateProgress(40, "Installiere Abhängigkeiten...")
		l.logger.Println("[INFO] node_modules not found, installing dependencies...")
		time.Sleep(500 * time.Millisecond)
		l.updateProgress(45, "HINWEIS: npm install kann einige Minuten dauern, bitte das Fenster offen halten und warten")

		err = l.installDependencies()
		if err != nil {
			l.logger.Printf("[ERROR] Dependency installation failed: %v\n", err)
			l.updateProgress(45, fmt.Sprintf("FEHLER: %v", err))
			time.Sleep(5 * time.Second)
			l.closeLogging()
			os.Exit(1)
		}

		l.updateProgress(80, "Installation abgeschlossen!")
		l.logger.Println("[SUCCESS] Dependencies installed successfully")
	} else {
		l.updateProgress(80, "Abhängigkeiten bereits installiert...")
		l.logger.Println("[INFO] Dependencies already installed")
	}
	time.Sleep(300 * time.Millisecond)

	// Phase 3.5: Auto-fix common issues (80-89%)
	l.updateProgress(82, "Prüfe Konfiguration...")
	l.logger.Println("[Phase 3.5] Auto-fixing common issues...")
	time.Sleep(300 * time.Millisecond)
	
	// Auto-fix: Create .env file if missing
	if err := l.autoFixEnvFile(); err != nil {
		l.logger.Printf("[WARNING] Could not auto-create .env: %v\n", err)
	}
	
	// Auto-fix: Check port availability
	l.autoFixPort()
	
	l.updateProgress(89, "Konfiguration geprüft!")
	time.Sleep(300 * time.Millisecond)

	// Phase 4: Start tool (90-100%)
	l.updateProgress(90, "Starte Tool...")
	l.logger.Println("[Phase 4] Starting Node.js server...")
	time.Sleep(500 * time.Millisecond)

	// Start the tool
	cmd, err := l.startTool()
	if err != nil {
		l.logger.Printf("[ERROR] Failed to start server: %v\n", err)
		l.updateProgress(90, fmt.Sprintf("FEHLER beim Starten: %v", err))
		l.updateProgress(90, "Prüfe bitte die Log-Datei in app/logs/ für Details.")
		time.Sleep(30 * time.Second)
		l.closeLogging()
		os.Exit(1)
	}

	// Monitor if the process exits prematurely
	processDied := make(chan error, 1)
	go func() {
		processDied <- cmd.Wait()
	}()

	// Wait for server to be ready
	l.updateProgress(93, "Warte auf Server-Start...")
	l.logger.Println("[INFO] Waiting for server health check (60s timeout)...")
	l.logger.Println("[INFO] Checking if server responds on http://localhost:3000...")

	// Check server health with process monitoring
	healthCheckTimeout := time.After(60 * time.Second)
	healthCheckTicker := time.NewTicker(1 * time.Second)
	defer healthCheckTicker.Stop()

	serverReady := false
	attemptCount := 0
	lastLogTime := time.Now()
	
	for !serverReady {
		select {
		case err := <-processDied:
			// Process exited before server was ready
			l.logger.Printf("[ERROR] Node.js process exited prematurely: %v\n", err)
			l.logger.Println("[ERROR] Server crashed during startup!")
			l.logger.Println("[ERROR] ===========================================")
			l.logger.Println("[ERROR] Bitte prüfe app/logs/launcher_*.log für Details")
			l.logger.Println("[ERROR] Häufige Ursachen:")
			l.logger.Println("[ERROR]  - Fehlende .env Datei (kopiere .env.example zu .env)")
			l.logger.Println("[ERROR]  - Port 3000 bereits belegt")
			l.logger.Println("[ERROR]  - Fehlende Dependencies (führe 'npm install' aus)")
			l.logger.Println("[ERROR]  - Syntax-Fehler im Code")
			l.logger.Println("[ERROR] ===========================================")
			
			// Check if we just fixed the .env file - if so, retry once
			if l.envFileFixed {
				l.logger.Println("[AUTO-FIX] .env file was just created - attempting restart...")
				l.updateProgress(95, "🔄 .env erstellt - starte Server neu...")
				time.Sleep(3 * time.Second)
				
				// Mark that we already tried the fix
				l.envFileFixed = false
				
				// Start server again
				cmd, err = l.startTool()
				if err != nil {
					l.logger.Printf("[ERROR] Retry failed to start server: %v\n", err)
				} else {
					// Monitor the restarted process
					go func() {
						processDied <- cmd.Wait()
					}()
					
					l.updateProgress(96, "🔄 Server neugestartet - warte auf Antwort...")
					l.logger.Println("[INFO] Server restarted after .env fix - waiting for health check...")
					
					// Reset the ticker for another try
					continue
				}
			}
			
			l.updateProgress(95, "⚠️ Server konnte nicht starten!")
			time.Sleep(2 * time.Second)
			l.updateProgress(96, "📋 Alle Auto-Fixes wurden versucht")
			time.Sleep(2 * time.Second)
			l.updateProgress(97, "💡 Prüfe app/logs/launcher_*.log für Details")
			time.Sleep(2 * time.Second)
			l.updateProgress(98, "💡 Oder führe manuell: cd app && npm install")
			time.Sleep(2 * time.Second)
			l.updateProgress(99, "💡 Oder prüfe ob Port 3000 frei ist")
			time.Sleep(2 * time.Second)
			l.updateProgress(100, "❌ Launcher wird in 15 Sekunden geschlossen...")
			time.Sleep(15 * time.Second)
			l.closeLogging()
			os.Exit(1)
		case <-healthCheckTicker.C:
			attemptCount++
			
			// Log progress every 5 seconds
			if time.Since(lastLogTime) >= 5 * time.Second {
				l.logger.Printf("[INFO] Health check attempt %d (waiting for server to respond)...\n", attemptCount)
				l.updateProgress(93 + (attemptCount / 5), fmt.Sprintf("Warte auf Server... (Versuch %d)", attemptCount))
				lastLogTime = time.Now()
			}
			
			// Try multiple ports (server might have failed over)
			ports := []int{3000, 3001, 3002, 3003, 3004}
			for _, port := range ports {
				if l.checkServerHealthOnPort(port) {
					l.logger.Printf("[SUCCESS] Server responded on port %d!\n", port)
					if port != 3000 {
						l.logger.Printf("[INFO] Note: Server is running on port %d instead of 3000\n", port)
					}
					serverReady = true
					break
				}
			}
		case <-healthCheckTimeout:
			l.logger.Println("[ERROR] Server health check timed out after 60 seconds")
			l.logger.Println("[ERROR] Server did not respond. Check the log above for error messages.")
			l.logger.Println("[ERROR] ===========================================")
			l.logger.Println("[ERROR] Mögliche Probleme:")
			l.logger.Println("[ERROR]  - Server startet, aber hängt sich bei Initialisierung auf")
			l.logger.Println("[ERROR]  - Dependencies werden geladen (kann lange dauern)")
			l.logger.Println("[ERROR]  - Datenbank-Migration läuft")
			l.logger.Println("[ERROR]  - Port 3000 ist blockiert durch Firewall")
			l.logger.Println("[ERROR] ===========================================")
			
			l.updateProgress(95, "⏱️ Server-Start Timeout (60s)")
			time.Sleep(2 * time.Second)
			l.updateProgress(96, "📋 Server antwortet nicht - prüfe app/logs/")
			time.Sleep(2 * time.Second)
			l.updateProgress(97, "💡 Server läuft evtl. noch im Hintergrund")
			time.Sleep(2 * time.Second)
			l.updateProgress(98, "💡 Warte 2-3 Minuten und öffne localhost:3000")
			time.Sleep(2 * time.Second)
			l.updateProgress(100, "❌ Launcher wird in 15 Sekunden geschlossen...")
			time.Sleep(15 * time.Second)
			l.closeLogging()
			os.Exit(1)
		}
	}

	l.updateProgress(100, "Server erfolgreich gestartet!")
	l.logger.Println("[SUCCESS] Server is running and healthy!")
	time.Sleep(500 * time.Millisecond)
	l.updateProgress(100, "Weiterleitung zum Dashboard...")
	l.logger.Println("[INFO] Redirecting to dashboard...")
	time.Sleep(500 * time.Millisecond)
	l.sendRedirect()

	// Keep server running to allow redirect to complete
	time.Sleep(3 * time.Second)
	l.closeLogging()
	os.Exit(0)
}

func main() {
	launcher := NewLauncher()

	// Get executable directory
	exePath, err := os.Executable()
	if err != nil {
		log.Fatal("Kann Programmverzeichnis nicht ermitteln:", err)
	}

	exeDir := filepath.Dir(exePath)
	launcher.appDir = filepath.Join(exeDir, "app")
	bgImagePath := filepath.Join(launcher.appDir, "launcherbg.png")

	// Setup logging immediately
	if err := launcher.setupLogging(launcher.appDir); err != nil {
		log.Printf("Warning: Could not setup logging: %v\n", err)
		// Continue anyway with default logger
		launcher.logger = log.New(os.Stdout, "", log.LstdFlags)
	}

	launcher.logger.Println("Launcher started successfully")
	launcher.logger.Printf("Executable directory: %s\n", exeDir)
	launcher.logger.Printf("App directory: %s\n", launcher.appDir)

	// Setup HTTP server
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.New("index").Parse(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>TikTok Stream Tool - Launcher</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            width: 100vw;
            height: 100vh;
            background-color: #1a1a2e;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            position: relative;
        }
        
        .launcher-container {
            width: 80vw;
            height: 80vh;
            background-image: url(/bg);
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            position: relative;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        }
        
        .progress-container {
            position: absolute;
            left: 50px;
            bottom: 150px;
            width: 650px;
        }
        
        .status-text {
            color: white;
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
            font-family: Arial, sans-serif;
        }
        
        .progress-bar-bg {
            width: 100%;
            height: 40px;
            background-color: rgba(0, 0, 0, 0.5);
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
        }
        
        .progress-bar-fill {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #00d4ff, #0099ff);
            border-radius: 20px;
            transition: width 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 16px;
        }
    </style>
</head>
<body>
    <div class="launcher-container">
        <div class="progress-container">
            <div class="status-text" id="status">Initialisiere...</div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" id="progressBar">0%</div>
            </div>
        </div>
    </div>
    
    <script>
        const evtSource = new EventSource('/events');
        
        evtSource.onmessage = function(event) {
            const data = JSON.parse(event.data);
            
            // Handle redirect
            if (data.redirect) {
                evtSource.close();
                // Wait a moment for the dashboard to be ready, then redirect
                setTimeout(function() {
                    window.location.replace(data.redirect);
                }, 2000);
                return;
            }
            
            // Handle progress updates
            const progressBar = document.getElementById('progressBar');
            const statusText = document.getElementById('status');
            
            progressBar.style.width = data.progress + '%';
            progressBar.textContent = data.progress + '%';
            statusText.textContent = data.status;
        };
    </script>
</body>
</html>
`))
		tmpl.Execute(w, nil)
	})

	http.HandleFunc("/bg", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, bgImagePath)
	})

	http.HandleFunc("/events", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		client := make(chan string, 10)
		launcher.clients[client] = true

		// Send initial state
		msg := fmt.Sprintf(`{"progress": %d, "status": "%s"}`, launcher.progress, launcher.status)
		fmt.Fprintf(w, "data: %s\n\n", msg)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}

		// Listen for updates
		for {
			select {
			case msg := <-client:
				fmt.Fprintf(w, "data: %s\n\n", msg)
				if f, ok := w.(http.Flusher); ok {
					f.Flush()
				}
			case <-r.Context().Done():
				delete(launcher.clients, client)
				return
			}
		}
	})

	// Start HTTP server
	go func() {
		if err := http.ListenAndServe("127.0.0.1:58734", nil); err != nil {
			log.Fatal(err)
		}
	}()

	// Give server time to start
	time.Sleep(500 * time.Millisecond)

	// Open browser
	browser.OpenURL("http://127.0.0.1:58734")

	// Run launcher
	go launcher.runLauncher()

	// Keep running
	select {}
}
