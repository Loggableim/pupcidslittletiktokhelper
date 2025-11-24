package main

import (
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"github.com/pkg/browser"
)

type Launcher struct {
	nodePath string
	appDir   string
	progress int
	status   string
	clients  map[chan string]bool
}

func NewLauncher() *Launcher {
	return &Launcher{
		status:   "Initialisiere...",
		progress: 0,
		clients:  make(map[chan string]bool),
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
	msg := `{"redirect": "http://localhost:8080"}`
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
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", "npm", "install")
	} else {
		cmd = exec.Command("npm", "install")
	}
	
	cmd.Dir = l.appDir
	
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
	
	return cmd.Start()
}

func (l *Launcher) runLauncher() {
	time.Sleep(1 * time.Second) // Give browser time to load
	
	// Phase 1: Check Node.js (0-20%)
	l.updateProgress(0, "Prüfe Node.js Installation...")
	time.Sleep(500 * time.Millisecond)
	
	err := l.checkNodeJS()
	if err != nil {
		l.updateProgress(0, "FEHLER: Node.js ist nicht installiert!")
		time.Sleep(5 * time.Second)
		os.Exit(1)
	}
	
	l.updateProgress(10, "Node.js gefunden...")
	time.Sleep(300 * time.Millisecond)
	
	version := l.getNodeVersion()
	l.updateProgress(20, fmt.Sprintf("Node.js Version: %s", version))
	time.Sleep(300 * time.Millisecond)
	
	// Phase 2: Find directories (20-30%)
	l.updateProgress(25, "Prüfe App-Verzeichnis...")
	time.Sleep(300 * time.Millisecond)
	
	if _, err := os.Stat(l.appDir); os.IsNotExist(err) {
		l.updateProgress(25, "FEHLER: app Verzeichnis nicht gefunden")
		time.Sleep(5 * time.Second)
		os.Exit(1)
	}
	
	l.updateProgress(30, "App-Verzeichnis gefunden...")
	time.Sleep(300 * time.Millisecond)
	
	// Phase 3: Check and install dependencies (30-80%)
	l.updateProgress(30, "Prüfe Abhängigkeiten...")
	time.Sleep(300 * time.Millisecond)
	
	if !l.checkNodeModules() {
		l.updateProgress(40, "Installiere Abhängigkeiten...")
		time.Sleep(500 * time.Millisecond)
		l.updateProgress(45, "HINWEIS: npm install kann einige Minuten dauern, bitte das Fenster offen halten und warten")
		
		err = l.installDependencies()
		if err != nil {
			l.updateProgress(45, fmt.Sprintf("FEHLER: %v", err))
			time.Sleep(5 * time.Second)
			os.Exit(1)
		}
		
		l.updateProgress(80, "Installation abgeschlossen!")
	} else {
		l.updateProgress(80, "Abhängigkeiten bereits installiert...")
	}
	time.Sleep(300 * time.Millisecond)
	
	// Phase 4: Start tool (80-100%)
	l.updateProgress(90, "Starte Tool...")
	time.Sleep(500 * time.Millisecond)
	l.updateProgress(100, "Tool wird gestartet...")
	
	// Start the tool
	err = l.startTool()
	if err != nil {
		l.updateProgress(100, fmt.Sprintf("FEHLER: %v", err))
		time.Sleep(5 * time.Second)
		os.Exit(1)
	}
	
	// Wait for the dashboard to be ready before redirecting
	time.Sleep(5 * time.Second)
	l.updateProgress(100, "Weiterleitung zum Dashboard...")
	time.Sleep(500 * time.Millisecond)
	l.sendRedirect()
	
	// Keep server running to allow redirect to complete
	time.Sleep(5 * time.Second)
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
