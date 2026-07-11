package main

import (
	"errors"
	"fmt"
	"os"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"cascade/share"
	"cascade/store"
)

// Board import & clipboard paste bindings (plan 07 E3). Parse gates and the
// new-board materialization live in share/; this file adds the Wails chrome:
// clipboard read and open-file dialog.

const importDialogTitle = "Import board"

// ClipboardEnvelope is the paste probe result. Found=false means the
// clipboard holds no Cascade envelope at all — the paste is silently
// ignored. A clipboard that IS an envelope but malformed or newer than this
// app errors instead.
type ClipboardEnvelope struct {
	Found   bool           `json:"found"`
	Payload *share.Payload `json:"payload,omitempty"`
}

// ReadClipboardEnvelope probes the system clipboard for a Cascade envelope.
func (a *App) ReadClipboardEnvelope() (ClipboardEnvelope, error) {
	text, err := runtime.ClipboardGetText(a.ctx)
	if err != nil {
		return ClipboardEnvelope{}, fmt.Errorf("read clipboard: %w", err)
	}
	env, err := share.Parse([]byte(text))
	if errors.Is(err, share.ErrNotEnvelope) {
		return ClipboardEnvelope{}, nil
	}
	if err != nil {
		return ClipboardEnvelope{}, err
	}
	return ClipboardEnvelope{Found: true, Payload: &env.Cascade}, nil
}

// ImportBoardResult carries the imported board; Cancelled means the user
// dismissed the open-file dialog and nothing happened. Requires and
// Collections come from the envelope so the frontend can run the mapping
// step and merge embedded request definitions (plan 07 E4/E5).
type ImportBoardResult struct {
	Cancelled   bool               `json:"cancelled"`
	Board       store.Board        `json:"board"`
	Requires    share.Requires     `json:"requires"`
	Collections []store.Collection `json:"collections,omitempty"`
}

// ImportBoardFromFile imports an exported envelope file as a new board of
// the project (never a silent merge into an existing one).
func (a *App) ImportBoardFromFile(projectID string) (ImportBoardResult, error) {
	p, err := a.store.Project(projectID)
	if err != nil {
		return ImportBoardResult{}, err
	}
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: importDialogTitle,
		Filters: []runtime.FileFilter{
			{DisplayName: exportFilterName, Pattern: exportFilterPattern},
		},
	})
	if err != nil {
		return ImportBoardResult{}, err
	}
	if path == "" { // dialog cancelled
		return ImportBoardResult{Cancelled: true}, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return ImportBoardResult{}, fmt.Errorf("read import: %w", err)
	}
	board, payload, err := share.ImportBoard(p, data)
	if err != nil {
		return ImportBoardResult{}, err
	}
	return ImportBoardResult{
		Board:       board,
		Requires:    payload.Requires,
		Collections: payload.Collections,
	}, nil
}
