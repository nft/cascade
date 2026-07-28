package nodespec

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"cascade/core/httpcall"
	"cascade/core/transform"
)

// Loop modes (model.ts FOR_MODES).
const (
	LoopModeCount = "count"
	LoopModeEach  = "each"
)

// Iteration and wait bounds, mirroring model.ts (FOR_MIN_COUNT,
// FOR_MAX_ITERATIONS, DELAY_MIN_MS, DELAY_MAX_MS). Checked here for the
// inspector and again at dispatch: the UI clamps, but a hand-edited board
// must not spin a run for hours.
const (
	MinLoopCount      = 1
	MaxLoopIterations = 10_000

	MinDelay = time.Millisecond
	MaxDelay = 5 * time.Minute
)

// Validate runs the environment-free config checks the inspector can surface
// at edit time. It is not a gate: dispatch repeats every one of them, so a
// node that fails here fails only itself at run time.
func (s Spec) Validate() error {
	switch {
	case s.HTTP != nil:
		return s.HTTP.validate()
	case s.Transform != nil:
		return s.Transform.validate()
	case s.Mock != nil:
		return s.Mock.validate()
	case s.Delay != nil:
		return s.Delay.validate()
	case s.Loop != nil:
		return s.Loop.validate()
	}
	return nil
}

func (s HTTPSpec) validate() error {
	if s.Protocol != "" && s.Protocol != httpcall.ProtocolHTTP {
		return fmt.Errorf("protocol %q is not executable yet — only http requests run", s.Protocol)
	}
	if !httpcall.SupportedMethod(s.Method) {
		return fmt.Errorf("unsupported HTTP method %q", s.Method)
	}
	for _, f := range s.Fields {
		if _, _, err := f.Section(); err != nil {
			return err
		}
		if _, err := f.BindingSource(); err != nil {
			return fmt.Errorf("field %q: %w", f.Key, err)
		}
	}
	return nil
}

func (s TransformSpec) validate() error {
	// An empty mode is Pick, the default — same as transform.Execute treats it.
	switch transform.Mode(s.Mode) {
	case transform.ModePick, transform.ModeScript, "":
	default:
		return fmt.Errorf("unknown transform mode %q", s.Mode)
	}
	for _, f := range s.Pick {
		if _, err := f.BindingSource(); err != nil {
			return fmt.Errorf("pick %q: %w", f.Key, err)
		}
	}
	return nil
}

func (s MockSpec) validate() error {
	if !json.Valid([]byte(s.Body)) {
		return errors.New("mock body is not valid JSON")
	}
	return nil
}

func (s DelaySpec) validate() error {
	if d := s.Duration(); d < MinDelay || d > MaxDelay {
		return fmt.Errorf("delay of %dms is outside %v..%v", s.DurationMs, MinDelay, MaxDelay)
	}
	return nil
}

func (s LoopSpec) validate() error {
	switch s.Mode {
	case LoopModeEach:
		return nil
	case LoopModeCount:
		if s.Count < MinLoopCount || s.Count > MaxLoopIterations {
			return fmt.Errorf("loop count %d is outside %d..%d", s.Count, MinLoopCount, MaxLoopIterations)
		}
		return nil
	}
	return fmt.Errorf("unknown loop mode %q", s.Mode)
}
