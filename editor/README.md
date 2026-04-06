# Arenula Editor

C# plugin that runs inside the s&box editor, exposing scene manipulation, compilation, assets, and more over MCP (SSE transport on port 8098).

Part of the [Arenula MCP suite](../README.md). Based on [Ozmium MCP Server](https://github.com/ozmium7/ozmium-mcp-server-for-sbox) by ozmium7 (GPL-3.0).

## Install

Copy the contents of `editor/` into your s&box project's Libraries folder:

```
YourProject/
  Libraries/
    arenula_mcp/
      Editor/
        Core/
        Handlers/
      sbox_mcp.sbproj
```

Open s&box — the plugin compiles automatically and starts the MCP server on `http://localhost:8098/sse`.

## Architecture

8 core files, 20 handler files — one per tool.

| Core | Purpose |
|------|---------|
| `ArenulaMcpServer.cs` | HTTP listener, SSE transport, request routing |
| `RpcDispatcher.cs` | JSON-RPC dispatch to tool handlers |
| `ToolRegistry.cs` | Tool registration and schema generation |
| `HandlerBase.cs` | Base class for all tool handlers |
| `McpSession.cs` | Per-client session state |
| `McpServerWindow.cs` | Editor UI panel for server status |
| `SceneHelpers.cs` | Shared scene query utilities |
| `MaterialHelper.cs` | Material property helpers |

## Tools (19)

Each tool uses an `action` enum parameter. 19 tools, ~120 total actions.

| Tool | Actions |
|------|---------|
| **scene** | summary, hierarchy, statistics, find, find_in_radius, get_details, prefab_instances |
| **gameobject** | create, destroy, duplicate, reparent, rename, enable, set_tags, set_transform, batch_transform |
| **component** | add, remove, set_property, set_enabled, get_properties, get_types, copy |
| **compile** | trigger, status, errors, generate_solution, wait |
| **prefab** | instantiate, get_structure, get_instances, break, update, create, save_overrides, revert, get_overrides |
| **asset_query** | browse, search, open, get_dependencies, get_model_info, get_material_properties, get_mesh_info, get_bounds, get_unsaved, get_status, get_json, get_references |
| **asset_manage** | create, delete, rename, move, save, reload, get_references |
| **editor** | select, get/set_selected, clear/frame_selection, play controls, save, undo/redo, console, preferences |
| **session** | list, set_active, load_scene |
| **lighting** | create, configure, create_skybox, set_skybox |
| **physics** | add_collider, configure_collider, add_rigidbody, create_model_physics, create_character_controller, create_joint |
| **audio** | create, configure |
| **effects** | create, configure_particle, configure_post_processing |
| **camera** | create, configure, capture_viewport |
| **mesh** | create_block, create_clutter, set_face_material, set_texture_params, vertex ops, get_info |
| **navmesh** | create_agent, create_area, create_link, generate, get_status, query_path |
| **cloud** | search, get_package, mount |
| **project** | get_collision, set_collision_rule, get_input, get_info |
| **terrain** | create, configure, get_info, paint_material, sync |

## License

GPL-3.0 — see [LICENSE](LICENSE).
