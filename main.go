package main

import (
	"embed"
	"log"
	"os"
	"path/filepath"

	"cascade/store"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

// appDataDirName is the directory under os.UserConfigDir() holding all
// project data (e.g. ~/Library/Application Support/cascade on macOS).
const appDataDirName = "cascade"

func main() {
	configDir, err := os.UserConfigDir()
	if err != nil {
		log.Fatalf("resolve user config dir: %v", err)
	}
	// The keychain-backed SecretStore lands with plan 04; nil means no-op.
	manager := store.NewManager(filepath.Join(configDir, appDataDirName), nil)
	if err := bootstrapDefaultProject(manager); err != nil {
		log.Fatalf("bootstrap default project: %v", err)
	}

	app := NewApp(manager)

	err = wails.Run(&options.App{
		Title:  "cascade",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		Bind: []any{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
