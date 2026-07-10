package share

import "testing"

func TestExportFileName(t *testing.T) {
	cases := []struct {
		project, board, want string
	}{
		{"My Project", "Main", "my-project-main.cascade.json"},
		{"Payments API", "smoke / staging", "payments-api-smoke-staging.cascade.json"},
		{"café", "Böard", "caf-b-ard.cascade.json"},
		{"", "Main", "main.cascade.json"},
		{"My Project", "", "my-project.cascade.json"},
		{"", "", "board.cascade.json"},
		{"???", "!!!", "board.cascade.json"},
	}
	for _, tc := range cases {
		if got := ExportFileName(tc.project, tc.board); got != tc.want {
			t.Errorf("ExportFileName(%q, %q) = %q, want %q", tc.project, tc.board, got, tc.want)
		}
	}
}
