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
// diffable against the original file. Returns the saved board plus the parsed
// payload, whose requires/collections drive the frontend mapping step.
func ImportBoard(p *store.Project, data []byte) (store.Board, Payload, error) {
	env, err := Parse(data)
	if err != nil {
		return store.Board{}, Payload{}, err
	}
	boards, err := p.Boards()
	if err != nil {
		return store.Board{}, Payload{}, err
	}
	id, err := store.NewID()
	if err != nil {
		return store.Board{}, Payload{}, err
	}
	board := env.Cascade.Board
	board.ID = id
	board.Name = importedBoardName(board.Name, boards)
	// Export drops captured responses as run data that has no business leaving
	// the machine; the same holds arriving. A Cascade-made envelope never
	// carries them, but a hand-written or third-party one can, and importing
	// it would write someone else's response bodies into this project.
	board.Layout.Responses = nil
	if err := p.SaveBoard(board); err != nil {
		return store.Board{}, Payload{}, fmt.Errorf("save imported board: %w", err)
	}
	return board, env.Cascade, nil
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
