#!/usr/bin/env python3
import os
import json
import base64
import urllib.request

# Environment
NEO4J_HTTP_URL = os.getenv("HISTORIAN_NEO4J_HTTP_URL", "http://localhost:7474/db/neo4j/tx/commit")
NEO4J_USER = os.getenv("HISTORIAN_NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("HISTORIAN_NEO4J_PASSWORD", "novelgraphpass")
QDRANT_URL = os.getenv("HISTORIAN_QDRANT_URL", "http://localhost:6333")

def neo4j_query(statement):
    auth = base64.b64encode(f"{NEO4J_USER}:{NEO4J_PASSWORD}".encode("utf-8")).decode("ascii")
    payload = {"statements": [{"statement": statement}]}
    req = urllib.request.Request(
        NEO4J_HTTP_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Basic {auth}"},
        method="POST"
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def qdrant_request(path, method="GET", payload=None):
    url = f"{QDRANT_URL}/{path.lstrip('/')}"
    data = json.dumps(payload).encode("utf-8") if payload else None
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method=method)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def init_neo4j():
    print("Initializing Neo4j Constraints...")
    constraints = [
        "CREATE CONSTRAINT character_name_unique IF NOT EXISTS FOR (n:Character) REQUIRE n.name IS UNIQUE",
        "CREATE CONSTRAINT location_name_unique IF NOT EXISTS FOR (n:Location) REQUIRE n.name IS UNIQUE",
        "CREATE INDEX story_id_idx IF NOT EXISTS FOR (n:Character) ON (n.story_id)",
        "CREATE INDEX chapter_id_idx IF NOT EXISTS FOR (n:Event) ON (n.chapter_id)"
    ]
    for c in constraints:
        res = neo4j_query(c)
        print(f"  - {c}: {res.get('errors') or 'OK'}")

def init_qdrant():
    print("Initializing Qdrant Collections...")
    collections = ["narrative_swas_memory", "style_dna_templates"]
    for col in collections:
        try:
            # Check if exists
            qdrant_request(f"collections/{col}")
            print(f"  - Collection {col} already exists.")
        except:
            # Create
            payload = {
                "vectors": {
                    "size": 1536, # Default for OpenAI or similar
                    "distance": "Cosine"
                }
            }
            res = qdrant_request(f"collections/{col}", method="PUT", payload=payload)
            print(f"  - Created collection {col}: {res.get('status') or 'OK'}")

if __name__ == "__main__":
    try:
        init_neo4j()
        init_qdrant()
        print("\nInitialization Complete. Historian Phase 2/3 Ready.")
    except Exception as e:
        print(f"\nError during initialization: {e}")
