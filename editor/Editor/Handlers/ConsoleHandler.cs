// Editor/Handlers/ConsoleHandler.cs
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Sandbox;

namespace Arenula;

/// <summary>
/// Console actions for the editor tool: console_list, console_run.
/// Dispatched BEFORE GameTask.MainThread() in RpcDispatcher for exception isolation.
/// Exposed via the 'editor' tool schema but handled in a separate file.
/// Ported from Ozmium ConsoleToolHandlers + OzmiumEditorHandlers.
/// </summary>
internal static class ConsoleHandler
{
    internal static object Handle( string action, JsonElement args )
    {
        try
        {
            return action switch
            {
                "console_list" => ConsoleList( args ),
                "console_run"  => ConsoleRun( args ),
                _ => HandlerBase.Error( $"Unknown console action '{action}'", action,
                    "Valid console actions: console_list, console_run" )
            };
        }
        catch ( Exception ex )
        {
            return HandlerBase.Error( ex.Message, action );
        }
    }

    // ── console_list ─────────────────────────────────────────────────────
    // Ported from ConsoleToolHandlers.ListConsoleCommands + OzmiumEditorHandlers.ListConsoleCommands

    private static object ConsoleList( JsonElement args )
    {
        var filter = HandlerBase.GetString( args, "filter" );
        var entries = new List<object>();

        foreach ( var asm in AppDomain.CurrentDomain.GetAssemblies() )
        {
            try
            {
                foreach ( var type in asm.GetTypes() )
                {
                    foreach ( var prop in type.GetProperties(
                        System.Reflection.BindingFlags.Public |
                        System.Reflection.BindingFlags.NonPublic |
                        System.Reflection.BindingFlags.Static ) )
                    {
                        var attr = prop.GetCustomAttributes( typeof( ConVarAttribute ), false )
                            .FirstOrDefault() as ConVarAttribute;
                        if ( attr == null ) continue;

                        var cvarName = !string.IsNullOrEmpty( attr.Name )
                            ? attr.Name
                            : prop.Name.ToLowerInvariant();

                        if ( !string.IsNullOrEmpty( filter )
                            && cvarName.IndexOf( filter, StringComparison.OrdinalIgnoreCase ) < 0 )
                            continue;

                        string currentValue = null;
                        try { currentValue = ConsoleSystem.GetValue( cvarName ); } catch { }

                        entries.Add( new
                        {
                            name = cvarName,
                            help = attr.Help ?? "",
                            flags = attr.Flags.ToString(),
                            saved = attr.Flags.HasFlag( ConVarFlags.Saved ),
                            currentValue,
                            declaringType = type.Name
                        } );
                    }
                }
            }
            catch { }
        }

        // Deduplicate by name and sort
        var unique = entries
            .GroupBy( e =>
            {
                var nameField = e.GetType().GetProperty( "name" );
                return nameField?.GetValue( e )?.ToString() ?? "";
            } )
            .Select( g => g.First() )
            .OrderBy( e =>
            {
                var nameField = e.GetType().GetProperty( "name" );
                return nameField?.GetValue( e )?.ToString() ?? "";
            } )
            .ToList();

        return HandlerBase.Success( new
        {
            count = unique.Count,
            entries = unique
        } );
    }

    // ── console_run ──────────────────────────────────────────────────────
    // Ported from ConsoleToolHandlers.RunConsoleCommand + OzmiumEditorHandlers.RunConsoleCommand

    private static object ConsoleRun( JsonElement args )
    {
        var command = HandlerBase.GetString( args, "command" );
        if ( string.IsNullOrEmpty( command ) )
            return HandlerBase.Error( "Missing required 'command' parameter.", "console_run" );

        var parts = command.Trim().Split( ' ', StringSplitOptions.RemoveEmptyEntries );
        if ( parts.Length == 0 )
            return HandlerBase.Error( "Empty command.", "console_run" );

        var cmdName = parts[0];

        // Only support convars — ConsoleSystem.Run throws uncatchable exceptions
        string current = null;
        try { current = ConsoleSystem.GetValue( cmdName ); } catch { }

        if ( current == null )
            return HandlerBase.Error(
                $"Unknown convar: '{cmdName}'. Only [ConVar] properties are supported.",
                "console_run",
                "Use editor.console_list to see available command names." );

        // Read-only query
        if ( parts.Length == 1 )
            return HandlerBase.Text( $"{cmdName} = {current}" );

        // Write: set the convar value
        var newValue = string.Join( " ", parts, 1, parts.Length - 1 );
        ConsoleSystem.SetValue( cmdName, newValue );

        string readback = null;
        try { readback = ConsoleSystem.GetValue( cmdName ); } catch { }

        return HandlerBase.Text( $"Set {cmdName} = {readback ?? newValue}" );
    }
}
