package share

import (
	"fmt"

	"cascade/store"
)

// fallbackBoardName names an imported board whose envelope carries none
// (selection envelopes have no board identity).
const fallbackBoardName = "Imported board"

// ImportBoard parses an exported envelope and materializes it as a new board
// of the project — an import never merges into an existing board. The board
// gets a fresh ID and a name deduplicated against the project's boards; node
// IDs stay as exported (they are board-scoped), which keeps a re-export
// diffable against the original file. Returns the saved board.
func ImportBoard(p *store.Project, data []byte) (store.Board, error) {
	env, err := Parse(data)
	if err != nil {
		return store.Board{}, err
	}
	boards, err := p.Boards()
	if err != nil {
		return store.Board{}, err
	}
	id, err := store.NewID()
	if err != nil {
		return store.Board{}, err
	}
	board := env.Cascade.Board
	board.ID = id
	board.Name = importedBoardName(board.Name, boards)
	if err := p.SaveBoard(board); err != nil {
		return store.Board{}, fmt.Errorf("save imported board: %w", err)
	}
	return board, nil
}

// importedBoardName deduplicates the imported name against the project's
// boards: "Signup chain" → "Signup chain 2" and so on.
func importedBoardName(name string, existing []store.Board) string {
	if name == "" {
		name = fallbackBoardName
	}
	taken := make(map[string]bool, len(existing))
	for _, b := range existing {
		taken[b.Name] = true
	}
	if !taken[name] {
		return name
	}
	for n := 2; ; n++ {
		candidate := fmt.Sprintf("%s %d", name, n)
		if !taken[candidate] {
			return candidate
		}
	}
}
