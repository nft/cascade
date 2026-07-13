export namespace httpcall {
	
	export class RawBody {
	    contentType: string;
	    text: string;
	
	    static createFrom(source: any = {}) {
	        return new RawBody(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.contentType = source["contentType"];
	        this.text = source["text"];
	    }
	}

}

export namespace main {
	
	export class ClipboardEnvelope {
	    found: boolean;
	    payload?: share.Payload;
	
	    static createFrom(source: any = {}) {
	        return new ClipboardEnvelope(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.found = source["found"];
	        this.payload = this.convertValues(source["payload"], share.Payload);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ImportBoardResult {
	    cancelled: boolean;
	    board: store.Board;
	    requires: share.Requires;
	    collections?: store.Collection[];
	
	    static createFrom(source: any = {}) {
	        return new ImportBoardResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cancelled = source["cancelled"];
	        this.board = this.convertValues(source["board"], store.Board);
	        this.requires = this.convertValues(source["requires"], share.Requires);
	        this.collections = this.convertValues(source["collections"], store.Collection);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ProjectBundle {
	    project: store.ProjectMeta;
	    sources: store.Source[];
	    environments: store.Environment[];
	    credentials: store.Credential[];
	    boards: store.Board[];
	    collections: store.Collection[];
	
	    static createFrom(source: any = {}) {
	        return new ProjectBundle(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.project = this.convertValues(source["project"], store.ProjectMeta);
	        this.sources = this.convertValues(source["sources"], store.Source);
	        this.environments = this.convertValues(source["environments"], store.Environment);
	        this.credentials = this.convertValues(source["credentials"], store.Credential);
	        this.boards = this.convertValues(source["boards"], store.Board);
	        this.collections = this.convertValues(source["collections"], store.Collection);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ScriptUpstream {
	    status: number;
	    headers?: Record<string, string>;
	    body: any;
	
	    static createFrom(source: any = {}) {
	        return new ScriptUpstream(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.headers = source["headers"];
	        this.body = source["body"];
	    }
	}
	export class ScriptRunRequest {
	    script: string;
	    nodes: Record<string, ScriptUpstream>;
	    res?: ScriptUpstream;
	    index: number;
	
	    static createFrom(source: any = {}) {
	        return new ScriptRunRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.script = source["script"];
	        this.nodes = this.convertValues(source["nodes"], ScriptUpstream, true);
	        this.res = this.convertValues(source["res"], ScriptUpstream);
	        this.index = source["index"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class TestRequest {
	    protocol?: string;
	    method: string;
	    origin?: string;
	    envBase?: string;
	    path: string;
	    pathParams?: Record<string, string>;
	    query?: Record<string, string>;
	    headers?: Record<string, string>;
	    body?: any;
	    rawBody?: httpcall.RawBody;
	    credential?: string;
	
	    static createFrom(source: any = {}) {
	        return new TestRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.protocol = source["protocol"];
	        this.method = source["method"];
	        this.origin = source["origin"];
	        this.envBase = source["envBase"];
	        this.path = source["path"];
	        this.pathParams = source["pathParams"];
	        this.query = source["query"];
	        this.headers = source["headers"];
	        this.body = source["body"];
	        this.rawBody = this.convertValues(source["rawBody"], httpcall.RawBody);
	        this.credential = source["credential"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TestResponse {
	    status: number;
	    headers?: Record<string, string>;
	    body?: any;
	    bodyText: string;
	    truncated?: boolean;
	    durationMs: number;
	    url: string;
	    sentHeaders?: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new TestResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.headers = source["headers"];
	        this.body = source["body"];
	        this.bodyText = source["bodyText"];
	        this.truncated = source["truncated"];
	        this.durationMs = source["durationMs"];
	        this.url = source["url"];
	        this.sentHeaders = source["sentHeaders"];
	    }
	}

}

export namespace share {
	
	export class CredentialRequirement {
	    name: string;
	    kind?: string;
	
	    static createFrom(source: any = {}) {
	        return new CredentialRequirement(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.kind = source["kind"];
	    }
	}
	export class SourceRequirement {
	    id: string;
	    title: string;
	    embedded: boolean;
	    source?: store.Source;
	
	    static createFrom(source: any = {}) {
	        return new SourceRequirement(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.embedded = source["embedded"];
	        this.source = this.convertValues(source["source"], store.Source);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Requires {
	    environments: string[];
	    credentials: CredentialRequirement[];
	    sources: SourceRequirement[];
	
	    static createFrom(source: any = {}) {
	        return new Requires(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.environments = source["environments"];
	        this.credentials = this.convertValues(source["credentials"], CredentialRequirement);
	        this.sources = this.convertValues(source["sources"], SourceRequirement);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Payload {
	    kind: string;
	    formatVersion: number;
	    app: string;
	    board: store.Board;
	    requires: Requires;
	    collections?: store.Collection[];
	
	    static createFrom(source: any = {}) {
	        return new Payload(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.formatVersion = source["formatVersion"];
	        this.app = source["app"];
	        this.board = this.convertValues(source["board"], store.Board);
	        this.requires = this.convertValues(source["requires"], Requires);
	        this.collections = this.convertValues(source["collections"], store.Collection);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	

}

export namespace store {
	
	export class Viewport {
	    x: number;
	    y: number;
	    zoom: number;
	
	    static createFrom(source: any = {}) {
	        return new Viewport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.x = source["x"];
	        this.y = source["y"];
	        this.zoom = source["zoom"];
	    }
	}
	export class Position {
	    x: number;
	    y: number;
	
	    static createFrom(source: any = {}) {
	        return new Position(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.x = source["x"];
	        this.y = source["y"];
	    }
	}
	export class BoardLayout {
	    positions: Record<string, Position>;
	    viewport?: Viewport;
	    responses?: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new BoardLayout(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.positions = this.convertValues(source["positions"], Position, true);
	        this.viewport = this.convertValues(source["viewport"], Viewport);
	        this.responses = source["responses"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BoardEdge {
	    id?: string;
	    from: string;
	    to: string;
	
	    static createFrom(source: any = {}) {
	        return new BoardEdge(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.from = source["from"];
	        this.to = source["to"];
	    }
	}
	export class BoardNode {
	    id: string;
	    type?: string;
	    name?: string;
	    data?: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new BoardNode(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.name = source["name"];
	        this.data = source["data"];
	    }
	}
	export class Board {
	    formatVersion: number;
	    id: string;
	    name: string;
	    nodes: BoardNode[];
	    edges: BoardEdge[];
	    layout: BoardLayout;
	
	    static createFrom(source: any = {}) {
	        return new Board(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.formatVersion = source["formatVersion"];
	        this.id = source["id"];
	        this.name = source["name"];
	        this.nodes = this.convertValues(source["nodes"], BoardNode);
	        this.edges = this.convertValues(source["edges"], BoardEdge);
	        this.layout = this.convertValues(source["layout"], BoardLayout);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class RequestDef {
	    id: string;
	    name: string;
	    protocol: string;
	    method?: string;
	    url: string;
	    defaults?: any[];
	    requestSchema?: Record<string, any>;
	    responseSchema?: Record<string, any>;
	    description?: string;
	
	    static createFrom(source: any = {}) {
	        return new RequestDef(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.protocol = source["protocol"];
	        this.method = source["method"];
	        this.url = source["url"];
	        this.defaults = source["defaults"];
	        this.requestSchema = source["requestSchema"];
	        this.responseSchema = source["responseSchema"];
	        this.description = source["description"];
	    }
	}
	export class CollectionFolder {
	    id: string;
	    name: string;
	    folders?: CollectionFolder[];
	    requests: RequestDef[];
	
	    static createFrom(source: any = {}) {
	        return new CollectionFolder(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.folders = this.convertValues(source["folders"], CollectionFolder);
	        this.requests = this.convertValues(source["requests"], RequestDef);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Collection {
	    formatVersion: number;
	    id: string;
	    name: string;
	    root: CollectionFolder;
	
	    static createFrom(source: any = {}) {
	        return new Collection(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.formatVersion = source["formatVersion"];
	        this.id = source["id"];
	        this.name = source["name"];
	        this.root = this.convertValues(source["root"], CollectionFolder);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Credential {
	    name: string;
	    kind: string;
	    header?: string;
	    param?: string;
	    template?: string;
	    username?: string;
	    createdAt?: string;
	
	    static createFrom(source: any = {}) {
	        return new Credential(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.kind = source["kind"];
	        this.header = source["header"];
	        this.param = source["param"];
	        this.template = source["template"];
	        this.username = source["username"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class Defaults {
	    environment?: string;
	    credential?: string;
	
	    static createFrom(source: any = {}) {
	        return new Defaults(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.environment = source["environment"];
	        this.credential = source["credential"];
	    }
	}
	export class Environment {
	    name: string;
	    baseUrl: string;
	
	    static createFrom(source: any = {}) {
	        return new Environment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.baseUrl = source["baseUrl"];
	    }
	}
	export class Operation {
	    ref: string;
	    method: string;
	    path: string;
	    summary?: string;
	    group?: string;
	
	    static createFrom(source: any = {}) {
	        return new Operation(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ref = source["ref"];
	        this.method = source["method"];
	        this.path = source["path"];
	        this.summary = source["summary"];
	        this.group = source["group"];
	    }
	}
	
	export class ProjectInfo {
	    id: string;
	    name: string;
	    path: string;
	    lastOpenedAt?: string;
	
	    static createFrom(source: any = {}) {
	        return new ProjectInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.path = source["path"];
	        this.lastOpenedAt = source["lastOpenedAt"];
	    }
	}
	export class ProjectMeta {
	    formatVersion: number;
	    id: string;
	    name: string;
	    createdAt: string;
	    defaults: Defaults;
	
	    static createFrom(source: any = {}) {
	        return new ProjectMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.formatVersion = source["formatVersion"];
	        this.id = source["id"];
	        this.name = source["name"];
	        this.createdAt = source["createdAt"];
	        this.defaults = this.convertValues(source["defaults"], Defaults);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Source {
	    id: string;
	    title: string;
	    version?: string;
	    operations: Operation[];
	
	    static createFrom(source: any = {}) {
	        return new Source(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.version = source["version"];
	        this.operations = this.convertValues(source["operations"], Operation);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

