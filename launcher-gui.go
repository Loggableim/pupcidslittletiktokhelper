package main

import (
	"encoding/base64"
	"fmt"
	"io/ioutil"
	"log"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"github.com/zserge/lorca"
)

type Launcher struct {
	ui       lorca.UI
	nodePath string
	appDir   string
}

func NewLauncher() *Launcher {
	return &Launcher{}
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

func (l *Launcher) updateProgress(value int, status string) {
	l.ui.Eval(fmt.Sprintf(`updateProgress(%d, "%s")`, value, status))
	time.Sleep(100 * time.Millisecond)
}

func (l *Launcher) runLauncher() {
	// Phase 1: Check Node.js (0-20%)
	l.updateProgress(0, "Prüfe Node.js Installation...")
	
	err := l.checkNodeJS()
	if err != nil {
		l.updateProgress(0, "FEHLER: Node.js ist nicht installiert!")
		time.Sleep(3 * time.Second)
		os.Exit(1)
	}
	
	l.updateProgress(10, "Node.js gefunden...")
	
	version := l.getNodeVersion()
	l.updateProgress(20, fmt.Sprintf("Node.js Version: %s", version))
	
	// Phase 2: Find directories (20-30%)
	exePath, err := os.Executable()
	if err != nil {
		l.updateProgress(20, "FEHLER: Kann Programmverzeichnis nicht ermitteln")
		time.Sleep(3 * time.Second)
		os.Exit(1)
	}
	
	exeDir := filepath.Dir(exePath)
	l.appDir = filepath.Join(exeDir, "app")
	
	l.updateProgress(25, "Prüfe App-Verzeichnis...")
	
	if _, err := os.Stat(l.appDir); os.IsNotExist(err) {
		l.updateProgress(25, "FEHLER: app Verzeichnis nicht gefunden")
		time.Sleep(3 * time.Second)
		os.Exit(1)
	}
	
	l.updateProgress(30, "App-Verzeichnis gefunden...")
	
	// Phase 3: Check and install dependencies (30-80%)
	l.updateProgress(30, "Prüfe Abhängigkeiten...")
	
	if !l.checkNodeModules() {
		l.updateProgress(40, "Installiere Abhängigkeiten...")
		l.updateProgress(45, "Dies kann beim ersten Start einige Minuten dauern...")
		
		err = l.installDependencies()
		if err != nil {
			l.updateProgress(45, fmt.Sprintf("FEHLER: %v", err))
			time.Sleep(3 * time.Second)
			os.Exit(1)
		}
		
		l.updateProgress(80, "Installation abgeschlossen!")
	} else {
		l.updateProgress(80, "Abhängigkeiten bereits installiert...")
	}
	
	// Phase 4: Start tool (80-100%)
	l.updateProgress(90, "Starte Tool...")
	
	time.Sleep(500 * time.Millisecond)
	l.updateProgress(100, "Tool wird gestartet...")
	
	time.Sleep(1 * time.Second)
	
	// Start the tool
	err = l.startTool()
	if err != nil {
		fmt.Printf("Fehler beim Starten: %v\n", err)
		time.Sleep(3 * time.Second)
		os.Exit(1)
	}
	
	// Close the launcher after a short delay
	time.Sleep(2 * time.Second)
	os.Exit(0)
}

func (l *Launcher) getHTML(bgImageBase64 string) string {
	return fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            width: 1536px;
            height: 1024px;
            background-image: url(data:image/png;base64,%s);
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            font-family: Arial, sans-serif;
            overflow: hidden;
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
        }
        
        .progress-bar-bg {
            width: 100%%;
            height: 40px;
            background-color: rgba(0, 0, 0, 0.5);
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
        }
        
        .progress-bar-fill {
            height: 100%%;
            width: 0%%;
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
    <div class="progress-container">
        <div class="status-text" id="status">Initialisiere...</div>
        <div class="progress-bar-bg">
            <div class="progress-bar-fill" id="progressBar">0%%</div>
        </div>
    </div>
    
    <script>
        function updateProgress(value, status) {
            const progressBar = document.getElementById('progressBar');
            const statusText = document.getElementById('status');
            
            progressBar.style.width = value + '%%';
            progressBar.textContent = value + '%%';
            statusText.textContent = status;
        }
    </script>
</body>
</html>
`, bgImageBase64)
}

func main() {
	launcher := NewLauncher()
	
	// Get executable directory
	exePath, err := os.Executable()
	if err != nil {
		log.Fatal("Kann Programmverzeichnis nicht ermitteln:", err)
	}
	
	exeDir := filepath.Dir(exePath)
	bgImagePath := filepath.Join(exeDir, "app", "launcherbg.png")
	
	// Read and encode background image
	var bgImageBase64 string
	if imageData, err := ioutil.ReadFile(bgImagePath); err == nil {
		bgImageBase64 = base64.StdEncoding.EncodeToString(imageData)
	} else {
		log.Fatal("Kann Hintergrundbild nicht laden:", err)
	}
	
	// Create HTML
	htmlContent := launcher.getHTML(bgImageBase64)
	
	// Create lorca UI
	ui, err := lorca.New("data:text/html,"+url.PathEscape(htmlContent), "", 1536, 1024)
	if err != nil {
		log.Fatal("Kann UI nicht erstellen:", err)
	}
	defer ui.Close()
	
	launcher.ui = ui
	
	// Start launcher process
	go launcher.runLauncher()
	
	// Wait for UI to close
	<-ui.Done()
}
