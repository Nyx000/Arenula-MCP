using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Editor;
using Sandbox;

namespace Arenula;

/// <summary>
/// gameobject tool: create, destroy, duplicate, reparent, rename, enable, set_tags, set_transform, batch_transform.
/// Ported from Ozmium OzmiumWriteHandlers + UtilityToolHandlers.BatchTransform.
/// </summary>
internal static class GameObjectHandler
{
    internal static object Handle( string action, JsonElement args )
    {
        try
        {
            return action switch
            {
                "create"          => Create( args ),
                "destroy"         => Destroy( args ),
                "duplicate"       => Duplicate( args ),
                "reparent"        => Reparent( args ),
                "rename"          => Rename( args ),
                "enable"          => Enable( args ),
                "set_tags"        => SetTags( args ),
                "set_transform"   => SetTransform( args ),
                "batch_transform" => BatchTransform( args ),
                _ => HandlerBase.Error( $"Unknown action '{action}' for tool 'gameobject'.", action,
                    "Valid actions: create, destroy, duplicate, reparent, rename, enable, set_tags, set_transform, batch_transform" )
            };
        }
        catch ( Exception ex )
        {
            return HandlerBase.Error( ex.Message, action );
        }
    }

    // ── create ────────────────────────────────────────────────────────

    private static object Create( JsonElement args )
    {
        var scene = SceneHelpers.ResolveScene();
        if ( scene == null )
            return HandlerBase.Error( "No active scene.", "create" );

        var name = HandlerBase.GetString( args, "name", "New GameObject" );
        var parentId = HandlerBase.GetString( args, "parent_id" );
        var posStr = HandlerBase.GetString( args, "position" );
        var rotStr = HandlerBase.GetString( args, "rotation" );
        var scaleStr = HandlerBase.GetString( args, "scale" );

        var go = scene.CreateObject();
        go.Name = name;

        if ( !string.IsNullOrEmpty( parentId ) )
        {
            var parent = SceneHelpers.FindByIdOrThrow( scene, parentId, "create" );
            go.SetParent( parent );
        }

        if ( !string.IsNullOrEmpty( posStr ) )
            go.WorldPosition = HandlerBase.ParseVector3( posStr );

        if ( !string.IsNullOrEmpty( rotStr ) )
        {
            var r = HandlerBase.ParseVector3( rotStr );
            go.WorldRotation = Rotation.From( r.x, r.y, r.z );
        }

        if ( !string.IsNullOrEmpty( scaleStr ) )
            go.WorldScale = HandlerBase.ParseVector3( scaleStr );

        return HandlerBase.WriteConfirm( go, $"Created '{go.Name}'." );
    }

    // ── destroy ───────────────────────────────────────────────────────

    private static object Destroy( JsonElement args )
    {
        var scene = SceneHelpers.ResolveScene();
        if ( scene == null )
            return HandlerBase.Error( "No active scene.", "destroy" );

        var id = HandlerBase.GetString( args, "id" );
        if ( string.IsNullOrEmpty( id ) )
            return HandlerBase.Error( "Missing required 'id' parameter.", "destroy" );

        var go = SceneHelpers.FindByIdOrThrow( scene, id, "destroy" );
        var displayName = go.Name;
        go.Destroy();

        return HandlerBase.Confirm( $"Destroyed '{displayName}' ({id})." );
    }

    // ── duplicate ─────────────────────────────────────────────────────

    private static object Duplicate( JsonElement args )
    {
        var scene = SceneHelpers.ResolveScene();
        if ( scene == null )
            return HandlerBase.Error( "No active scene.", "duplicate" );

        var id = HandlerBase.GetString( args, "id" );
        if ( string.IsNullOrEmpty( id ) )
            return HandlerBase.Error( "Missing required 'id' parameter.", "duplicate" );

        var go = SceneHelpers.FindByIdOrThrow( scene, id, "duplicate" );

        // Serialize + deserialize into the correct scene for a safe deep copy.
        // Clone() may target Game.ActiveScene which can differ from the editor session scene.
        var json = go.Serialize();
        var clone = scene.CreateObject( false );
        clone.Deserialize( json );
        clone.Name = go.Name;
        clone.MakeNameUnique();
        clone.Enabled = true;

        return HandlerBase.WriteConfirm( clone, $"Duplicated '{go.Name}' as '{clone.Name}'." );
    }

    // ── reparent ──────────────────────────────────────────────────────

    private static object Reparent( JsonElement args )
    {
        var scene = SceneHelpers.ResolveScene();
        if ( scene == null )
            return HandlerBase.Error( "No active scene.", "reparent" );

        var id = HandlerBase.GetString( args, "id" );
        if ( string.IsNullOrEmpty( id ) )
            return HandlerBase.Error( "Missing required 'id' parameter.", "reparent" );

        var parentId = HandlerBase.GetString( args, "parent_id" );
        if ( string.IsNullOrEmpty( parentId ) )
            return HandlerBase.Error( "Missing required 'parent_id' parameter. Pass 'null' to move to scene root.", "reparent" );

        var go = SceneHelpers.FindByIdOrThrow( scene, id, "reparent" );

        if ( parentId == "null" || parentId == "root" )
        {
            go.SetParent( null );
            return HandlerBase.WriteConfirm( go, $"Moved '{go.Name}' to scene root." );
        }

        var parent = SceneHelpers.FindByIdOrThrow( scene, parentId, "reparent" );
        go.SetParent( parent );

        return HandlerBase.WriteConfirm( go, $"Moved '{go.Name}' under '{parent.Name}'." );
    }

    // ── rename ────────────────────────────────────────────────────────

    private static object Rename( JsonElement args )
    {
        var scene = SceneHelpers.ResolveScene();
        if ( scene == null )
            return HandlerBase.Error( "No active scene.", "rename" );

        var id = HandlerBase.GetString( args, "id" );
        if ( string.IsNullOrEmpty( id ) )
            return HandlerBase.Error( "Missing required 'id' parameter.", "rename" );

        var name = HandlerBase.GetString( args, "name" );
        if ( string.IsNullOrEmpty( name ) )
            return HandlerBase.Error( "Missing required 'name' parameter.", "rename" );

        var go = SceneHelpers.FindByIdOrThrow( scene, id, "rename" );
        var oldName = go.Name;
        go.Name = name;

        return HandlerBase.WriteConfirm( go, $"Renamed '{oldName}' to '{go.Name}'." );
    }

    // ── enable ────────────────────────────────────────────────────────

    private static object Enable( JsonElement args )
    {
        var scene = SceneHelpers.ResolveScene();
        if ( scene == null )
            return HandlerBase.Error( "No active scene.", "enable" );

        var id = HandlerBase.GetString( args, "id" );
        if ( string.IsNullOrEmpty( id ) )
            return HandlerBase.Error( "Missing required 'id' parameter.", "enable" );

        var go = SceneHelpers.FindByIdOrThrow( scene, id, "enable" );

        if ( args.TryGetProperty( "enabled", out var enabledEl ) )
            go.Enabled = enabledEl.GetBoolean();
        else
            return HandlerBase.Error( "Missing required 'enabled' parameter.", "enable" );

        return HandlerBase.WriteConfirm( go, $"'{go.Name}' is now {(go.Enabled ? "enabled" : "disabled")}." );
    }

    // ── set_tags ──────────────────────────────────────────────────────

    private static object SetTags( JsonElement args )
    {
        var scene = SceneHelpers.ResolveScene();
        if ( scene == null )
            return HandlerBase.Error( "No active scene.", "set_tags" );

        var id = HandlerBase.GetString( args, "id" );
        if ( string.IsNullOrEmpty( id ) )
            return HandlerBase.Error( "Missing required 'id' parameter.", "set_tags" );

        var tagsStr = HandlerBase.GetString( args, "tags" );
        if ( string.IsNullOrEmpty( tagsStr ) )
            return HandlerBase.Error( "Missing required 'tags' parameter (comma-separated tag list).", "set_tags" );

        var go = SceneHelpers.FindByIdOrThrow( scene, id, "set_tags" );

        // Replace all tags
        go.Tags.RemoveAll();
        foreach ( var tag in tagsStr.Split( ',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries ) )
            go.Tags.Add( tag );

        return HandlerBase.WriteConfirm( go, $"Tags on '{go.Name}': {string.Join( ", ", go.Tags.TryGetAll() )}" );
    }

    // ── set_transform ─────────────────────────────────────────────────

    private static object SetTransform( JsonElement args )
    {
        var scene = SceneHelpers.ResolveScene();
        if ( scene == null )
            return HandlerBase.Error( "No active scene.", "set_transform" );

        var id = HandlerBase.GetString( args, "id" );
        if ( string.IsNullOrEmpty( id ) )
            return HandlerBase.Error( "Missing required 'id' parameter.", "set_transform" );

        var go = SceneHelpers.FindByIdOrThrow( scene, id, "set_transform" );
        var space = HandlerBase.GetString( args, "space", "world" );
        bool isLocal = space.Equals( "local", StringComparison.OrdinalIgnoreCase );

        var posStr = HandlerBase.GetString( args, "position" );
        var rotStr = HandlerBase.GetString( args, "rotation" );
        var scaleStr = HandlerBase.GetString( args, "scale" );

        if ( !string.IsNullOrEmpty( posStr ) )
        {
            var pos = HandlerBase.ParseVector3( posStr );
            if ( isLocal ) go.LocalPosition = pos;
            else go.WorldPosition = pos;
        }

        if ( !string.IsNullOrEmpty( rotStr ) )
        {
            var r = HandlerBase.ParseVector3( rotStr );
            var rot = Rotation.From( r.x, r.y, r.z );
            if ( isLocal ) go.LocalRotation = rot;
            else go.WorldRotation = rot;
        }

        if ( !string.IsNullOrEmpty( scaleStr ) )
        {
            var s = HandlerBase.ParseVector3( scaleStr );
            if ( isLocal ) go.LocalScale = s;
            else go.WorldScale = s;
        }

        return HandlerBase.Success( new
        {
            id = go.Id.ToString(),
            name = go.Name,
            message = $"Updated {space} transform for '{go.Name}'.",
            space,
            position = isLocal ? HandlerBase.V3( go.LocalPosition ) : HandlerBase.V3( go.WorldPosition ),
            rotation = isLocal ? HandlerBase.Rot( go.LocalRotation ) : HandlerBase.Rot( go.WorldRotation ),
            scale = isLocal ? HandlerBase.V3( go.LocalScale ) : HandlerBase.V3( go.WorldScale )
        } );
    }

    // ── batch_transform ───────────────────────────────────────────────

    private static object BatchTransform( JsonElement args )
    {
        var scene = SceneHelpers.ResolveScene();
        if ( scene == null )
            return HandlerBase.Error( "No active scene.", "batch_transform" );

        var idsStr = HandlerBase.GetString( args, "ids" );
        if ( string.IsNullOrEmpty( idsStr ) )
            return HandlerBase.Error( "Missing required 'ids' parameter (comma-separated GUIDs).", "batch_transform" );

        var posStr = HandlerBase.GetString( args, "position" );
        var rotStr = HandlerBase.GetString( args, "rotation" );
        var scaleStr = HandlerBase.GetString( args, "scale" );

        if ( string.IsNullOrEmpty( posStr ) && string.IsNullOrEmpty( rotStr ) && string.IsNullOrEmpty( scaleStr ) )
            return HandlerBase.Error( "Provide at least one of: position, rotation, scale.", "batch_transform" );

        Vector3? posOffset = !string.IsNullOrEmpty( posStr ) ? HandlerBase.ParseVector3( posStr ) : null;
        Vector3? rotOffset = !string.IsNullOrEmpty( rotStr ) ? HandlerBase.ParseVector3( rotStr ) : null;
        Vector3? scaleOffset = !string.IsNullOrEmpty( scaleStr ) ? HandlerBase.ParseVector3( scaleStr ) : null;

        var ids = idsStr.Split( ',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries );
        int count = 0;
        var errors = new List<string>();

        foreach ( var id in ids )
        {
            var go = SceneHelpers.FindById( scene, id );
            if ( go == null )
            {
                errors.Add( $"Not found: {id}" );
                continue;
            }

            if ( posOffset.HasValue )
                go.WorldPosition += posOffset.Value;

            if ( rotOffset.HasValue )
            {
                var r = rotOffset.Value;
                go.WorldRotation *= Rotation.From( r.x, r.y, r.z );
            }

            if ( scaleOffset.HasValue )
                go.WorldScale *= scaleOffset.Value;

            count++;
        }

        var message = $"Transformed {count} object(s).";
        if ( errors.Count > 0 )
            message += $" Errors: {string.Join( "; ", errors )}";

        return HandlerBase.Confirm( message );
    }
}
