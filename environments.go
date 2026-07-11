package main

import "cascade/store"

// SaveEnvironments replaces the project's environment list. First consumer is
// the import mapping step (plan 07 E4), which creates placeholder
// environments for unmatched requires; an environment editor UI will reuse it.
func (a *App) SaveEnvironments(projectID string, environments []store.Environment) error {
	p, err := a.store.Project(projectID)
	if err != nil {
		return err
	}
	return p.SaveEnvironments(environments)
}
