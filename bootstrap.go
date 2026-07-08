package main

import (
	_ "embed"
	"encoding/json"
	"fmt"

	"cascade/store"
)

// defaultProjectName is the project auto-created on first launch, so the
// single-project experience is zero-ceremony.
const defaultProjectName = "Default"

// seedJSON is the demo dataset the first-launch Default project is seeded
// with. It mirrors frontend/src/lib/mock.ts, which still backs vitest and
// plain-browser dev — keep the two in sync until the real engine data
// replaces both.
//
//go:embed seed/default.json
var seedJSON []byte

type seedData struct {
	Defaults     store.Defaults      `json:"defaults"`
	Source       store.Source        `json:"source"`
	Environments []store.Environment `json:"environments"`
	Credentials  []store.Credential  `json:"credentials"`
	Collection   store.Collection    `json:"collection"`
	Board        store.Board         `json:"board"`
}

// bootstrapDefaultProject creates and seeds the "Default" project when the
// index is empty (first launch); any existing project means there is nothing
// to do.
func bootstrapDefaultProject(m *store.Manager) error {
	projects, err := m.ListProjects()
	if err != nil {
		return err
	}
	if len(projects) > 0 {
		return nil
	}

	var seed seedData
	if err := json.Unmarshal(seedJSON, &seed); err != nil {
		return fmt.Errorf("parse embedded seed: %w", err)
	}

	info, err := m.CreateProject(defaultProjectName)
	if err != nil {
		return err
	}
	// OpenProject (not Project) so the fresh Default is also the
	// last-opened project the frontend picks on launch.
	p, err := m.OpenProject(info.ID)
	if err != nil {
		return err
	}
	if err := p.SetDefaults(seed.Defaults); err != nil {
		return err
	}
	if seed.Source.ID, err = store.NewID(); err != nil {
		return err
	}
	if err := p.SaveSource(seed.Source); err != nil {
		return err
	}
	if err := p.SaveEnvironments(seed.Environments); err != nil {
		return err
	}
	if err := p.SaveCredentials(seed.Credentials); err != nil {
		return err
	}
	if seed.Collection.ID, err = store.NewID(); err != nil {
		return err
	}
	if err := p.SaveCollection(seed.Collection); err != nil {
		return err
	}

	// Seed the auto-created "Main" board rather than adding a second one.
	boards, err := p.Boards()
	if err != nil {
		return err
	}
	if len(boards) > 0 {
		seed.Board.ID = boards[0].ID
		seed.Board.Name = boards[0].Name
	} else if seed.Board.ID, err = store.NewID(); err != nil {
		return err
	}
	return p.SaveBoard(seed.Board)
}
