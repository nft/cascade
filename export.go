package main

import (
	"fmt"
	"os"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"cascade/share"
	"cascade/store"
)

// Board export & clipboard sharing bindings (plan 07 E2). Envelope rules live
// in share/; this file adds only the Wails chrome: save dialog and clipboard.

// Exports are meant to be shared and committed, not protected — owner-writable,
// world-readable.
const exportedFilePerm = 0o644

const (
	exportDialogTitle   = "Export board"
	exportFilterName    = "Cascade board (*.cascade.json)"
	exportFilterPattern = "*.json"
)

// ExportBoardToFile exports one saved board through a save-file dialog and
// writes the envelope to the chosen path. Returns the path, or "" when the
// user cancels the dialog.
func (a *App) ExportBoardToFile(projectID, boardID string) (string, error) {
	p, err := a.store.Project(projectID)
	if err != nil {
		return "", err
	}
	data, err := share.ExportBoard(p, boardID)
	if err != nil {
		return "", err
	}
	meta, err := p.Meta()
	if err != nil {
		return "", err
	}
	board, err := p.Board(boardID)
	if err != nil {
		return "", err
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           exportDialogTitle,
		DefaultFilename: share.ExportFileName(meta.Name, board.Name),
		Filters: []runtime.FileFilter{
			{DisplayName: exportFilterName, Pattern: exportFilterPattern},
		},
	})
	if err != nil {
		return "", err
	}
	if path == "" { // dialog cancelled
		return "", nil
	}
	if err := os.WriteFile(path, data, exportedFilePerm); err != nil {
		return "", fmt.Errorf("write export: %w", err)
	}
	return path, nil
}

// CopyBoardJSON puts one saved board's envelope on the system clipboard.
func (a *App) CopyBoardJSON(projectID, boardID string) error {
	p, err := a.store.Project(projectID)
	if err != nil {
		return err
	}
	data, err := share.ExportBoard(p, boardID)
	if err != nil {
		return err
	}
	return runtime.ClipboardSetText(a.ctx, string(data))
}

// CopySelection puts a selection envelope on the system clipboard. The board
// comes from the frontend rather than the store because a copy targets the
// live canvas, which may be ahead of the last debounced save.
func (a *App) CopySelection(projectID string, board store.Board, nodeIDs []string) error {
	p, err := a.store.Project(projectID)
	if err != nil {
		return err
	}
	data, err := share.ExportSelection(p, board, nodeIDs)
	if err != nil {
		return err
	}
	return runtime.ClipboardSetText(a.ctx, string(data))
}
