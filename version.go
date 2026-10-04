package main

import (
	_ "embed"
	"encoding/json"
	"os"
)

// wailsJSON is the build configuration, embedded so the binary knows the
// productVersion it was built as. wails.json is the one place the version is
// written: the plist, the exe resources and the release workflow's tag check
// all read it from there too.
//
//go:embed wails.json
var wailsJSON []byte

// versionEnv makes a build report a different version than it was built as.
// A dev build set to an old version is the only way to rehearse the update
// flow against a real release before a second one exists.
const versionEnv = "CASCADE_UPDATE_VERSION"

type wailsConfig struct {
	Info struct {
		ProductVersion string `json:"productVersion"`
	} `json:"info"`
}

// appVersion is the running build's version, "" when the embedded
// configuration cannot be read (which a test guards against).
func appVersion() string {
	if v := os.Getenv(versionEnv); v != "" {
		return v
	}
	var cfg wailsConfig
	if err := json.Unmarshal(wailsJSON, &cfg); err != nil {
		return ""
	}
	return cfg.Info.ProductVersion
}
