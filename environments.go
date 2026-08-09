package main

import "cascade/store"

// SaveEnvironments replaces the project's environment list. Its consumers are
// the environments editor and the import mapping step (plan 07 E4), which
// creates placeholder environments for unmatched requires.
func (a *App) SaveEnvironments(projectID string, environments []store.Environment) error {
	p, err := a.store.Project(projectID)
	if err != nil {
		return err
	}
	return p.SaveEnvironments(environments)
}

// SetProjectDefaults stores the environment and credential newly added nodes
// are born with. Deliberately a thin wrapper: keeping the default pointed at
// an environment that still exists is the editor's job, because it has to
// update its own copy of the meta in the same action either way, and a rule
// enforced here as well would be the same rule written twice.
func (a *App) SetProjectDefaults(projectID string, defaults store.Defaults) error {
	p, err := a.store.Project(projectID)
	if err != nil {
		return err
	}
	return p.SetDefaults(defaults)
}
