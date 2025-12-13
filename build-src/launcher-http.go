package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

//go:embed assets/launcher.html
var launcherHTML string

//go:embed assets/launcher.css
var launcherCSS string

//go:embed assets/launcher.js
var launcherJS string

func setupHTTPServer(l *Launcher) {
	// Serve main HTML page
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, launcherHTML)
	})

	// Serve CSS
	http.HandleFunc("/assets/launcher.css", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
		fmt.Fprint(w, launcherCSS)
	})

	// Serve JavaScript
	http.HandleFunc("/assets/launcher.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		fmt.Fprint(w, launcherJS)
	})

	// Serve background image
	http.HandleFunc("/bg", func(w http.ResponseWriter, r *http.Request) {
		bgPath := filepath.Join(l.appDir, "launcherbg.jpg")
		// Validate file exists and is within app directory
		if !fileExistsAndSafe(bgPath, l.appDir) {
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}
		http.ServeFile(w, r, bgPath)
	})

	// Serve logo image
	http.HandleFunc("/logo", func(w http.ResponseWriter, r *http.Request) {
		// Use nightmode logo (PNG version matching app/public/ltthmini_nightmode.png)
		logoPath := filepath.Join(l.exeDir, "images", "ltthmini", "ltthmini_nightmode.png")
		// Validate file exists and is within exe directory
		if !fileExistsAndSafe(logoPath, l.exeDir) {
			http.Error(w, "Logo not found", http.StatusNotFound)
			return
		}
		http.ServeFile(w, r, logoPath)
	})

	// API: Get available languages
	http.HandleFunc("/api/languages", func(w http.ResponseWriter, r *http.Request) {
		languages := getAvailableLanguages(l.appDir)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(languages)
	})

	// API: Get translations for a language
	http.HandleFunc("/api/translations", func(w http.ResponseWriter, r *http.Request) {
		lang := r.URL.Query().Get("lang")
		if lang == "" {
			lang = "en"
		}

		translations := loadTranslations(l.appDir, lang)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(translations)
	})

	// API: Get profiles
	http.HandleFunc("/api/profiles", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			handleGetProfiles(w, r, l)
		} else if r.Method == "POST" {
			handleCreateProfile(w, r, l)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// API: Set active profile
	http.HandleFunc("/api/profile/select", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			handleSetActiveProfile(w, r, l)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// API: Get changelog
	http.HandleFunc("/api/changelog", func(w http.ResponseWriter, r *http.Request) {
		changelog := loadChangelog(l.appDir)
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		fmt.Fprint(w, changelog)
	})

	// API: Set keep-open preference
	http.HandleFunc("/api/set-keep-open", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			KeepOpen bool `json:"keepOpen"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		l.keepOpen = req.KeepOpen
		savePreference(l.appDir, "keepLauncherOpen", req.KeepOpen)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"success": true})
	})

	// Server-Sent Events for progress updates
	http.HandleFunc("/events", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		client := make(chan string, 10)

		l.clientsMux.Lock()
		l.clients[client] = true
		l.clientsMux.Unlock()

		// Send initial state
		msg := fmt.Sprintf(`{"progress": %d, "status": %s}`, l.progress, escapeJSON(l.status))
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
				l.clientsMux.Lock()
				delete(l.clients, client)
				l.clientsMux.Unlock()
				return
			}
		}
	})
}

// getAvailableLanguages returns the list of available languages
func getAvailableLanguages(appDir string) []Language {
	languages := []Language{
		{Code: "de", Name: "Deutsch", Flag: "🇩🇪"},
		{Code: "en", Name: "English", Flag: "🇬🇧"},
		{Code: "es", Name: "Español", Flag: "🇪🇸"},
		{Code: "fr", Name: "Français", Flag: "🇫🇷"},
	}

	// Verify files exist
	localesDir := filepath.Join(appDir, "locales")
	var available []Language
	for _, lang := range languages {
		langFile := filepath.Join(localesDir, lang.Code+".json")
		if _, err := os.Stat(langFile); err == nil {
			available = append(available, lang)
		}
	}

	return available
}

// loadTranslations loads launcher-specific translations
func loadTranslations(appDir, lang string) map[string]interface{} {
	localeFile := filepath.Join(appDir, "locales", lang+".json")

	translations := make(map[string]interface{})
	// Set default translations
	setDefaultTranslations(translations, lang)

	// Try to load from file
	data, err := os.ReadFile(localeFile)
	if err == nil {
		var fullLocale map[string]interface{}
		if json.Unmarshal(data, &fullLocale) == nil {
			// Extract launcher-specific translations if they exist
			if launcherData, ok := fullLocale["launcher"].(map[string]interface{}); ok {
				for k, v := range launcherData {
					translations[k] = v
				}
			}
		}
	}

	return translations
}

func setDefaultTranslations(t map[string]interface{}, lang string) {
	// Set defaults based on language
	defaults := map[string]map[string]string{
		"de": {
			"select_language":         "Sprache auswählen",
			"select_language_desc":    "Bitte wählen Sie Ihre bevorzugte Sprache",
			"continue":                "Weiter",
			"keep_launcher_open":      "Launcher offen halten",
			"launch_dashboard":        "Dashboard öffnen",
			"create_profile":          "Profil erstellen",
			"select_or_create":        "Profil auswählen oder erstellen",
			"welcome":                 "Willkommen",
			"resources":               "Ressourcen",
			"changelog":               "Changelog",
			"community":               "Community",
			"logging":                 "Protokollierung",
			"checking_nodejs":         "Prüfe Node.js...",
			"nodejs_found":            "Node.js gefunden",
			"installing_deps":         "Installiere Abhängigkeiten...",
			"starting_server":         "Starte Server...",
			"server_ready":            "Server bereit!",
			"redirecting_to_dash":     "Weiterleitung zum Dashboard...",
		},
		"en": {
			"select_language":         "Select Language",
			"select_language_desc":    "Please select your preferred language",
			"continue":                "Continue",
			"keep_launcher_open":      "Keep Launcher Open",
			"launch_dashboard":        "Launch Dashboard",
			"create_profile":          "Create Profile",
			"select_or_create":        "Select or Create Profile",
			"welcome":                 "Welcome",
			"resources":               "Resources",
			"changelog":               "Changelog",
			"community":               "Community",
			"logging":                 "Logging",
			"checking_nodejs":         "Checking Node.js...",
			"nodejs_found":            "Node.js found",
			"installing_deps":         "Installing dependencies...",
			"starting_server":         "Starting server...",
			"server_ready":            "Server ready!",
			"redirecting_to_dash":     "Redirecting to dashboard...",
		},
	}

	langDefaults, ok := defaults[lang]
	if !ok {
		langDefaults = defaults["en"] // Fallback to English
	}

	for k, v := range langDefaults {
		t[k] = v
	}
}

func handleGetProfiles(w http.ResponseWriter, r *http.Request, l *Launcher) {
	// Try to get profiles from the server API
	// If server is not ready, return empty list
	if !l.checkServerHealth() {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"profiles": []Profile{},
		})
		return
	}

	// Make request to server
	resp, err := http.Get("http://localhost:3000/api/profiles")
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"profiles": []Profile{},
		})
		return
	}
	defer resp.Body.Close()

	// Forward the response
	w.Header().Set("Content-Type", "application/json")
	io.Copy(w, resp.Body)
}

func handleCreateProfile(w http.ResponseWriter, r *http.Request, l *Launcher) {
	var req struct {
		Username   string `json:"username"`
		TikTokUser string `json:"tiktokUser"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if !l.checkServerHealth() {
		http.Error(w, "Server not ready", http.StatusServiceUnavailable)
		return
	}

	// Forward to server
	data, _ := json.Marshal(map[string]string{"username": req.Username})
	resp, err := http.Post("http://localhost:3000/api/profiles", "application/json", strings.NewReader(string(data)))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	io.Copy(w, resp.Body)
}

func handleSetActiveProfile(w http.ResponseWriter, r *http.Request, l *Launcher) {
	var req struct {
		Username string `json:"username"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if !l.checkServerHealth() {
		http.Error(w, "Server not ready", http.StatusServiceUnavailable)
		return
	}

	// Forward to server
	data, _ := json.Marshal(map[string]string{"username": req.Username})
	resp, err := http.Post("http://localhost:3000/api/profiles/switch", "application/json", strings.NewReader(string(data)))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	io.Copy(w, resp.Body)
}

func loadChangelog(appDir string) string {
	// Load both changelogs
	rootChangelog := filepath.Join(filepath.Dir(appDir), "CHANGELOG.md")
	appChangelog := filepath.Join(appDir, "CHANGELOG.md")

	content := ""

	// Load app changelog first
	if data, err := os.ReadFile(appChangelog); err == nil {
		content += "=== Application Changelog ===\n\n" + string(data) + "\n\n"
	}

	// Then root changelog
	if data, err := os.ReadFile(rootChangelog); err == nil {
		content += "=== Root Changelog ===\n\n" + string(data)
	}

	if content == "" {
		content = "No changelog available"
	}

	return content
}

func savePreference(appDir, key string, value interface{}) {
	prefsFile := filepath.Join(appDir, "launcher-prefs.json")

	var prefs map[string]interface{}
	if data, err := os.ReadFile(prefsFile); err == nil {
		json.Unmarshal(data, &prefs)
	} else {
		prefs = make(map[string]interface{})
	}

	prefs[key] = value
	data, _ := json.MarshalIndent(prefs, "", "  ")
	os.WriteFile(prefsFile, data, 0644)
}

// fileExistsAndSafe checks if a file exists and is within the allowed base directory
// This prevents directory traversal attacks
func fileExistsAndSafe(filePath, baseDir string) bool {
	// Get absolute paths
	absFile, err := filepath.Abs(filePath)
	if err != nil {
		return false
	}
	absBase, err := filepath.Abs(baseDir)
	if err != nil {
		return false
	}

	// Check if file is within base directory
	if !strings.HasPrefix(absFile, absBase) {
		return false
	}

	// Check if file exists
	if _, err := os.Stat(absFile); os.IsNotExist(err) {
		return false
	}

	return true
}
