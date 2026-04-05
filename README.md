# Arenula

MCP ([Model Context Protocol](https://modelcontextprotocol.io)) server suite for the [s&box](https://sbox.game) game engine. Connects AI coding assistants to the s&box editor in real time — reading scenes, creating objects, triggering compilation, managing assets, and more.

Based on [Ozmium MCP Server](https://github.com/ozmium7/ozmium-mcp-server-for-sbox) by ozmium7. Redesigned following [Anthropic's MCP best practices](https://www.anthropic.com/engineering/writing-tools-for-agents) — 19 omnibus tools with action parameters instead of 105 individual tools.

## Servers

| Server | Purpose | Runtime | Transport |
|---|---|---|---|
| **Editor** | Scene manipulation, compilation, asset management | C# (s&box plugin) | SSE on localhost:8098 |
| **API** | Offline type/member reference (~1,800 types) | Node.js (npx) | stdio |
| **Docs** | Narrative documentation from docs.facepunch.com | Node.js | stdio |

## Installation

### Editor (required)

Copy the `editor/` folder into your s&box project's `Libraries/` directory:

```
YourProject/
  Libraries/
    arenula_mcp/          <-- copy editor/ contents here
      Editor/
        Core/
        Handlers/
      sbox_mcp.sbproj
```

Open s&box — Arenula compiles automatically and starts the MCP server on port 8098.

### API (recommended)

No installation needed — runs via npx:

```bash
npx -y sbox-api-mcp
```

### Docs (optional)

Clone [sbox-docs-mcp](https://github.com/Nyx000/sbox-docs-mcp) and build, or point to a local install.

### Claude Code / AI Client Configuration

Copy `.mcp.json.example` to your project root as `.mcp.json` and adjust paths:

```json
{
  "mcpServers": {
    "editor": {
      "type": "sse",
      "url": "http://localhost:8098/sse"
    },
    "api": {
      "command": "npx",
      "args": ["-y", "sbox-api-mcp"],
      "env": {
        "SBOX_API_URL": "https://cdn.sbox.game/releases/2026-04-02-21-06-53.zip.json"
      }
    },
    "docs": {
      "command": "node",
      "args": ["path/to/sbox-docs-mcp/dist/index.js"]
    }
  }
}
```

Tools appear as `mcp__editor__*`, `mcp__api__*`, `mcp__docs__*`.

## Editor Tools (19 tools, ~120 actions)

Each tool uses an `action` parameter to select the operation.

| Tool | Actions | Description |
|---|---|---|
| `scene` | summary, hierarchy, statistics, find, find_in_radius, get_details, prefab_instances | Read-only scene queries |
| `gameobject` | create, destroy, duplicate, reparent, rename, enable, set_tags, set_transform, batch_transform | Create and modify GameObjects |
| `component` | add, remove, set_property, set_enabled, get_properties, get_types, copy | Manage components on GameObjects |
| `compile` | trigger, status, errors, generate_solution, wait | Code compilation and diagnostics |
| `prefab` | instantiate, get_structure, get_instances, break, update, create, save_overrides, revert, get_overrides | Prefab workflow and authoring |
| `asset_query` | browse, search, open, get_dependencies, get_model_info, get_material_properties, get_mesh_info, get_bounds, get_unsaved, get_status, get_json, get_references | Browse and inspect assets |
| `asset_manage` | create, delete, rename, move, save, reload, get_references | Create, rename, move, delete assets |
| `editor` | select, get_selected, set_selected, clear_selection, frame_selection, get_play_state, start_play, stop_play, get_log, save_scene, save_scene_as, undo, redo, console_list, console_run, open_code_file, get_preferences, set_preference | Editor control, selection, console, undo/redo |
| `session` | list, set_active, load_scene | Editor session management |
| `lighting` | create, configure, create_skybox, set_skybox | All light types and skybox |
| `physics` | add_collider, configure_collider, add_rigidbody, create_model_physics, create_character_controller, create_joint | Colliders, rigidbodies, joints |
| `audio` | create, configure | Sound points, zones, listeners |
| `effects` | create, configure_particle, configure_post_processing | Particles, fog, beams, ropes |
| `camera` | create, configure | Camera components |
| `mesh` | create_block, create_clutter, set_face_material, set_texture_params, set_vertex_position, set_vertex_color, set_vertex_blend, get_info | Polygon mesh editing |
| `navmesh` | create_agent, create_area, create_link, generate, get_status, query_path | Navigation mesh |
| `cloud` | search, get_package, mount | Workshop asset store |
| `project` | get_collision, set_collision_rule, get_input, get_info | Project settings |
| `terrain` | create, configure, get_info, paint_material, sync | Terrain editing |

## Architecture

```
AI Client --> HTTP/SSE --> ArenulaMcpServer (inside s&box editor)
                            |
                         RpcDispatcher
                            |
              +-------------+-------------+
              |             |             |
         async tools   console path   main thread
        (compile,cloud) (exception    (all other
         background      isolation)    scene tools)
              |             |             |
           Handler       Handler       Handler
```

- **19 handler files** — one per tool, in `Editor/Handlers/`
- **8 core files** — transport, dispatch, schemas, helpers, in `Editor/Core/`
- **Threading**: Scene APIs run on main thread via `GameTask.MainThread()`. Async tools (compile, cloud) dispatch on background thread to avoid deadlocks.

## Design Principles

Following [Anthropic's MCP tool design guidance](https://www.anthropic.com/engineering/writing-tools-for-agents):

- **Omnibus tools** — related operations grouped with `action` enum, not separate tools
- **Rich descriptions** — 3-4 sentences per tool with negative guidance ("use X instead")
- **Trimmed responses** — canonical `{id, name}` tuples, pagination, 16K char truncation
- **Actionable errors** — suggestions for recovery, similar type fuzzy matching
- **`additionalProperties: false`** — prevents parameter hallucination

## Attribution

Based on [Ozmium MCP Server](https://github.com/ozmium7/ozmium-mcp-server-for-sbox) by ozmium7.

## License

GPL-3.0 — see [LICENSE](LICENSE).
