using System;
using System.Text.Json;
using System.Threading.Tasks;
using Sandbox;

namespace Arenula;

/// <summary>
/// JSON-RPC dispatch: extracts tool name + action, routes to handler.
/// Handles threading: async tools dispatch before MainThread, sync tools after.
/// </summary>
internal static class RpcDispatcher
{
    internal static async Task ProcessRpcRequest(
        McpSession session,
        object id,
        string method,
        string rawBody,
        JsonSerializerOptions jsonOptions,
        Action<string> logInfo,
        Action<string> logError )
    {
        object result = null;
        object error = null;

        using var doc = JsonDocument.Parse( rawBody );
        var root = doc.RootElement;

        try
        {
            if ( method == "initialize" )
            {
                result = new
                {
                    protocolVersion = "2024-11-05",
                    capabilities = new { tools = new { listChanged = true } },
                    serverInfo = new { name = "Arenula Editor", version = ToolRegistry.Version }
                };
            }
            else if ( method == "tools/list" )
            {
                result = new { tools = ToolRegistry.All };
            }
            else if ( method == "tools/call" )
            {
                var args = root.TryGetProperty( "params", out var p ) && p.TryGetProperty( "arguments", out var a ) ? a : default;
                var toolName = root.GetProperty( "params" ).GetProperty( "name" ).GetString();
                var action = HandlerBase.GetString( args, "action" );

                if ( string.IsNullOrEmpty( action ) )
                {
                    error = HandlerBase.ProtocolError( -32602, $"Missing required 'action' parameter for tool '{toolName}'." );
                }
                // ── Async tools (dispatch before MainThread) ─────────
                else if ( toolName == "compile" )
                {
                    logInfo?.Invoke( $"Running async tool {toolName}.{action}..." );
                    result = await CompileHandler.HandleAsync( action, args );
                }
                else if ( toolName == "cloud" )
                {
                    logInfo?.Invoke( $"Running async tool {toolName}.{action}..." );
                    result = await CloudHandler.HandleAsync( action, args );
                }
                // ── Console (separate sync dispatch for exception safety) ─
                else if ( toolName == "editor" && action is "console_run" or "console_list" )
                {
                    result = ConsoleHandler.Handle( action, args );
                }
                // ── All other tools (main thread) ────────────────────
                else
                {
                    logInfo?.Invoke( $"Waiting for MainThread to execute {toolName}.{action}..." );
                    await GameTask.MainThread();
                    logInfo?.Invoke( $"Resumed on MainThread for {toolName}.{action}." );

                    result = toolName switch
                    {
                        "scene"        => SceneHandler.Handle( action, args ),
                        "gameobject"   => GameObjectHandler.Handle( action, args ),
                        "component"    => ComponentHandler.Handle( action, args ),
                        "prefab"       => PrefabHandler.Handle( action, args ),
                        "asset_query"  => AssetQueryHandler.Handle( action, args ),
                        "asset_manage" => AssetManageHandler.Handle( action, args ),
                        "editor"       => EditorHandler.Handle( action, args ),
                        "mesh"         => MeshHandler.Handle( action, args ),
                        "lighting"     => LightingHandler.Handle( action, args ),
                        "physics"      => PhysicsHandler.Handle( action, args ),
                        "audio"        => AudioHandler.Handle( action, args ),
                        "effects"      => EffectsHandler.Handle( action, args ),
                        "camera"       => CameraHandler.Handle( action, args ),
                        "navmesh"      => NavmeshHandler.Handle( action, args ),
                        "session"      => SessionHandler.Handle( action, args ),
                        "project"      => ProjectHandler.Handle( action, args ),
                        "terrain"      => TerrainHandler.Handle( action, args ),
                        _              => throw new InvalidOperationException( $"Tool '{toolName}' not found" )
                    };
                }

                logInfo?.Invoke( $"Tool: {toolName}.{action}" );
            }
            else
            {
                error = HandlerBase.ProtocolError( -32601, $"Method '{method}' not found" );
            }
        }
        catch ( ArgumentException ex )
        {
            error = HandlerBase.ProtocolError( -32602, ex.Message );
        }
        catch ( InvalidOperationException ex ) when ( ex.Message.Contains( "not found" ) )
        {
            error = HandlerBase.ProtocolError( -32601, ex.Message );
        }
        catch ( Exception ex )
        {
            logError?.Invoke( $"RpcDispatcher catch: method={method} ex={ex.Message}" );
            error = new { code = -32603, message = $"Internal error: {ex.Message}" };
        }

        var response = new { jsonrpc = "2.0", id, result, error };
        var json = JsonSerializer.Serialize( response, jsonOptions );
        await ArenulaMcpServer.SendSseEvent( session, "message", json );
    }
}
