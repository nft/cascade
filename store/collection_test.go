package store

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

func testCollection(id string) Collection {
	return Collection{
		ID:   id,
		Name: "Payments",
		Root: CollectionFolder{
			ID: "root",
			Folders: []CollectionFolder{
				{
					ID:   "fold1",
					Name: "Invoices",
					Requests: []RequestDef{{
						ID:       "req1",
						Name:     "Create invoice",
						Protocol: ProtocolHTTP,
						Method:   "POST",
						URL:      "/v1/invoices",
						Defaults: []map[string]any{
							{"key": "body.amount", "source": "literal", "value": "100"},
						},
					}},
				},
			},
			Requests: []RequestDef{{
				ID:       "req2",
				Name:     "Ping",
				Protocol: ProtocolHTTP,
				Method:   "GET",
				URL:      "https://status.example.com/ping",
			}},
		},
	}
}

func TestCollectionRoundTrip(t *testing.T) {
	_, p := newTestProject(t)

	// A fresh project has no collections but never returns nil.
	got, err := p.Collections()
	if err != nil || got == nil || len(got) != 0 {
		t.Fatalf("Collections on fresh project = %+v, %v; want []", got, err)
	}

	c := testCollection("col1")
	if err := p.SaveCollection(c); err != nil {
		t.Fatalf("SaveCollection: %v", err)
	}
	got, err = p.Collections()
	if err != nil || len(got) != 1 {
		t.Fatalf("Collections = %+v, %v; want 1", got, err)
	}
	c.normalize() // saved form gains formatVersion and non-nil request lists
	if !reflect.DeepEqual(got[0], c) {
		t.Fatalf("round trip mismatch:\n got %+v\nwant %+v", got[0], c)
	}
}

func TestDeleteCollection(t *testing.T) {
	_, p := newTestProject(t)
	if err := p.SaveCollection(testCollection("col1")); err != nil {
		t.Fatalf("SaveCollection: %v", err)
	}
	if err := p.DeleteCollection("col1"); err != nil {
		t.Fatalf("DeleteCollection: %v", err)
	}
	if got, _ := p.Collections(); len(got) != 0 {
		t.Fatalf("Collections after delete = %+v; want none", got)
	}
	if err := p.DeleteCollection("col1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("DeleteCollection(missing) = %v; want ErrNotFound", err)
	}
}

func TestSaveCollectionRejectsBadInput(t *testing.T) {
	_, p := newTestProject(t)

	if err := p.SaveCollection(testCollection("../escape")); err == nil {
		t.Fatal("SaveCollection accepted a path-escaping id")
	}

	tooNew := testCollection("col1")
	tooNew.FormatVersion = CollectionFormatVersion + 1
	if err := p.SaveCollection(tooNew); err == nil {
		t.Fatal("SaveCollection accepted a newer format version")
	}

	badProto := testCollection("col1")
	badProto.Root.Requests[0].Protocol = "grpc"
	if err := p.SaveCollection(badProto); err == nil || !strings.Contains(err.Error(), "protocol") {
		t.Fatalf("SaveCollection(bad protocol) = %v; want protocol error", err)
	}

	// Depth 4 exceeds the cap of 3 named levels below the root.
	deep := testCollection("col1")
	deep.Root.Folders = []CollectionFolder{{ID: "a", Name: "a", Folders: []CollectionFolder{
		{ID: "b", Name: "b", Folders: []CollectionFolder{
			{ID: "c", Name: "c", Folders: []CollectionFolder{{ID: "d", Name: "d"}}},
		}},
	}}}
	if err := p.SaveCollection(deep); err == nil || !strings.Contains(err.Error(), "depth") {
		t.Fatalf("SaveCollection(too deep) = %v; want depth error", err)
	}

	// Exactly 3 levels is fine.
	atCap := testCollection("col1")
	atCap.Root.Folders = []CollectionFolder{{ID: "a", Name: "a", Folders: []CollectionFolder{
		{ID: "b", Name: "b", Folders: []CollectionFolder{{ID: "c", Name: "c"}}},
	}}}
	if err := p.SaveCollection(atCap); err != nil {
		t.Fatalf("SaveCollection(at depth cap) = %v; want ok", err)
	}
}
