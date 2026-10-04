//go:build !darwin && !linux && !windows

package update

import "context"

func stage(string) (Plan, error) {
	return Plan{}, ErrUnsupported
}

func apply(context.Context, Plan, string) error {
	return ErrUnsupported
}
