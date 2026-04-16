// editor/Editor/Handlers/TraceHandler.cs
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Sandbox;

namespace Arenula;

/// <summary>
/// trace tool: ray, sphere_cast, box_cast, sample_grid, multi_ray.
/// Spatial intelligence via Scene.Trace fluent API.
/// </summary>
internal static class TraceHandler
{
    internal static object Handle( string action, JsonElement args )
    {
        try
        {
            return action switch
            {
                "ray"          => Ray( args ),
                "sphere_cast"  => SphereCast( args ),
                "box_cast"     => BoxCast( args ),
                "sample_grid"  => SampleGrid( args ),
                "multi_ray"    => MultiRay( args ),
                _ => HandlerBase.Error( $"Unknown action '{action}'", action,
                    "Valid actions: ray, sphere_cast, box_cast, sample_grid, multi_ray" )
            };
        }
        catch ( Exception ex )
        {
            return HandlerBase.Error( ex.Message, action );
        }
    }

    // ── Shared: apply tag/ignore filters to a trace ──────────────────

    private static SceneTrace ApplyFilters( SceneTrace trace, JsonElement args )
    {
        var scene = SceneHelpers.ResolveScene();

        var tags = HandlerBase.GetString( args, "tags" );
        if ( !string.IsNullOrEmpty( tags ) )
        {
            var tagArr = tags.Split( ',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries );
            trace = trace.WithAnyTags( tagArr );
        }

        var ignoreTags = HandlerBase.GetString( args, "ignore_tags" );
        if ( !string.IsNullOrEmpty( ignoreTags ) )
        {
            var ignoreArr = ignoreTags.Split( ',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries );
            trace = trace.WithoutTags( ignoreArr );
        }

        var ignoreId = HandlerBase.GetString( args, "ignore_id" );
        if ( !string.IsNullOrEmpty( ignoreId ) && scene != null )
        {
            var ignoreGo = SceneHelpers.FindById( scene, ignoreId );
            if ( ignoreGo != null )
                trace = trace.IgnoreGameObjectHierarchy( ignoreGo );
        }

        if ( HandlerBase.GetBool( args, "hit_triggers", false ) )
            trace = trace.HitTriggers();

        return trace;
    }

    // ── Shared: format a SceneTraceResult into a response object ─────

    private static object FormatResult( SceneTraceResult r )
    {
        if ( !r.Hit )
        {
            return new
            {
                hit = false,
                start_position = HandlerBase.V3( r.StartPosition ),
                end_position = HandlerBase.V3( r.EndPosition ),
                distance = MathF.Round( r.Distance, 2 )
            };
        }

        return new
        {
            hit = true,
            position = HandlerBase.V3( r.EndPosition ),
            normal = HandlerBase.V3( r.Normal ),
            distance = MathF.Round( r.Distance, 2 ),
            fraction = MathF.Round( r.Fraction, 4 ),
            start_position = HandlerBase.V3( r.StartPosition ),
            end_position = HandlerBase.V3( r.EndPosition ),
            surface = r.Surface?.ResourceName,
            tags = r.Tags,
            @object = r.GameObject != null ? new { id = r.GameObject.Id.ToString(), name = r.GameObject.Name } : null,
            component_type = r.Component?.GetType().Name
        };
    }

    // ── ray ──────────────────────────────────────────────────────────

    private static object Ray( JsonElement args )
    {
        var scene = SceneHelpers.ResolveScene();
        if ( scene == null )
            return HandlerBase.Error( "No active scene.", "ray" );

        var fromStr = HandlerBase.GetString( args, "from" );
        var toStr = HandlerBase.GetString( args, "to" );
        if ( string.IsNullOrEmpty( fromStr ) || string.IsNullOrEmpty( toStr ) )
            return HandlerBase.Error( "Missing required 'from' and 'to' parameters (as 'x,y,z').", "ray" );

        var from = HandlerBase.ParseVector3( fromStr );
        var to = HandlerBase.ParseVector3( toStr );

        var trace = scene.Trace.Ray( from, to );
        trace = ApplyFilters( trace, args );
        var result = trace.Run();

        return HandlerBase.Success( FormatResult( result ) );
    }

    // ── sphere_cast ─────────────────────────────────────────────────

    private static object SphereCast( JsonElement args )
    {
        var scene = SceneHelpers.ResolveScene();
        if ( scene == null )
            return HandlerBase.Error( "No active scene.", "sphere_cast" );

        var fromStr = HandlerBase.GetString( args, "from" );
        var toStr = HandlerBase.GetString( args, "to" );
        if ( string.IsNullOrEmpty( fromStr ) || string.IsNullOrEmpty( toStr ) )
            return HandlerBase.Error( "Missing required 'from' and 'to' parameters (as 'x,y,z').", "sphere_cast" );

        var radius = HandlerBase.GetFloat( args, "radius" );
        if ( radius <= 0 )
            return HandlerBase.Error( "Missing or invalid 'radius' parameter (must be > 0).", "sphere_cast" );

        var from = HandlerBase.ParseVector3( fromStr );
        var to = HandlerBase.ParseVector3( toStr );

        var trace = scene.Trace.Sphere( radius, from, to );
        trace = ApplyFilters( trace, args );
        var result = trace.Run();

        return HandlerBase.Success( FormatResult( result ) );
    }

    // ── box_cast ────────────────────────────────────────────────────

    private static object BoxCast( JsonElement args )
    {
        var scene = SceneHelpers.ResolveScene();
        if ( scene == null )
            return HandlerBase.Error( "No active scene.", "box_cast" );

        var fromStr = HandlerBase.GetString( args, "from" );
        var toStr = HandlerBase.GetString( args, "to" );
        var sizeStr = HandlerBase.GetString( args, "size" );
        if ( string.IsNullOrEmpty( fromStr ) || string.IsNullOrEmpty( toStr ) )
            return HandlerBase.Error( "Missing required 'from' and 'to' parameters (as 'x,y,z').", "box_cast" );
        if ( string.IsNullOrEmpty( sizeStr ) )
            return HandlerBase.Error( "Missing required 'size' parameter (box extents as 'x,y,z').", "box_cast" );

        var from = HandlerBase.ParseVector3( fromStr );
        var to = HandlerBase.ParseVector3( toStr );
        var extents = HandlerBase.ParseVector3( sizeStr );

        var trace = scene.Trace.Box( extents, from, to );
        trace = ApplyFilters( trace, args );
        var result = trace.Run();

        return HandlerBase.Success( FormatResult( result ) );
    }

    // ── sample_grid ─────────────────────────────────────────────────

    private static object SampleGrid( JsonElement args )
    {
        var scene = SceneHelpers.ResolveScene();
        if ( scene == null )
            return HandlerBase.Error( "No active scene.", "sample_grid" );

        var centerStr = HandlerBase.GetString( args, "center" );
        var areaSizeStr = HandlerBase.GetString( args, "area_size" );
        if ( string.IsNullOrEmpty( centerStr ) || string.IsNullOrEmpty( areaSizeStr ) )
            return HandlerBase.Error( "Missing required 'center' (x,y,z) and 'area_size' (x,y) parameters.", "sample_grid" );

        var center = HandlerBase.ParseVector3( centerStr );
        var areaSize = HandlerBase.ParseVector2( areaSizeStr );
        var samplesX = Math.Clamp( HandlerBase.GetInt( args, "samples_x", 10 ), 1, 32 );
        var samplesY = Math.Clamp( HandlerBase.GetInt( args, "samples_y", 10 ), 1, 32 );
        var maxDepth = HandlerBase.GetFloat( args, "max_depth", 5000f );

        var grid = new List<object>();
        float minZ = float.MaxValue;
        float maxZ = float.MinValue;
        int hits = 0;

        float startX = center.x - areaSize.x / 2f;
        float startY = center.y - areaSize.y / 2f;
        float stepX = samplesX > 1 ? areaSize.x / ( samplesX - 1 ) : 0;
        float stepY = samplesY > 1 ? areaSize.y / ( samplesY - 1 ) : 0;

        for ( int iy = 0; iy < samplesY; iy++ )
        {
            for ( int ix = 0; ix < samplesX; ix++ )
            {
                float x = startX + ix * stepX;
                float y = startY + iy * stepY;
                var from = new Vector3( x, y, center.z );
                var to = new Vector3( x, y, center.z - maxDepth );

                var trace = scene.Trace.Ray( from, to );
                trace = ApplyFilters( trace, args );
                var result = trace.Run();

                if ( result.Hit )
                {
                    hits++;
                    float z = result.EndPosition.z;
                    if ( z < minZ ) minZ = z;
                    if ( z > maxZ ) maxZ = z;
                    grid.Add( new
                    {
                        x = MathF.Round( x, 1 ),
                        y = MathF.Round( y, 1 ),
                        hit = true,
                        z = MathF.Round( z, 2 ),
                        surface = result.Surface?.ResourceName,
                        object_name = result.GameObject?.Name
                    } );
                }
                else
                {
                    grid.Add( new
                    {
                        x = MathF.Round( x, 1 ),
                        y = MathF.Round( y, 1 ),
                        hit = false
                    } );
                }
            }
        }

        return HandlerBase.Success( new
        {
            grid,
            samples_x = samplesX,
            samples_y = samplesY,
            total_samples = samplesX * samplesY,
            hits,
            min_z = hits > 0 ? MathF.Round( minZ, 2 ) : (float?)null,
            max_z = hits > 0 ? MathF.Round( maxZ, 2 ) : (float?)null
        } );
    }

    // ── multi_ray ───────────────────────────────────────────────────

    private static object MultiRay( JsonElement args )
    {
        var scene = SceneHelpers.ResolveScene();
        if ( scene == null )
            return HandlerBase.Error( "No active scene.", "multi_ray" );

        if ( !args.TryGetProperty( "rays", out var raysEl ) || raysEl.ValueKind != JsonValueKind.Array )
            return HandlerBase.Error( "Missing required 'rays' parameter (JSON array of {from, to} objects).", "multi_ray" );

        var rayCount = raysEl.GetArrayLength();
        if ( rayCount > 256 )
            return HandlerBase.Error( $"Too many rays ({rayCount}). Maximum is 256 per call.", "multi_ray" );
        if ( rayCount == 0 )
            return HandlerBase.Error( "Empty 'rays' array.", "multi_ray" );

        var results = new List<object>();

        foreach ( var rayEl in raysEl.EnumerateArray() )
        {
            var fromStr = rayEl.TryGetProperty( "from", out var fEl ) && fEl.ValueKind == JsonValueKind.String
                ? fEl.GetString() : null;
            var toStr = rayEl.TryGetProperty( "to", out var tEl ) && tEl.ValueKind == JsonValueKind.String
                ? tEl.GetString() : null;

            if ( string.IsNullOrEmpty( fromStr ) || string.IsNullOrEmpty( toStr ) )
            {
                results.Add( new { hit = false, error = "Missing 'from' or 'to' in ray entry." } );
                continue;
            }

            var from = HandlerBase.ParseVector3( fromStr );
            var to = HandlerBase.ParseVector3( toStr );

            var trace = scene.Trace.Ray( from, to );
            trace = ApplyFilters( trace, args );
            var result = trace.Run();
            results.Add( FormatResult( result ) );
        }

        return HandlerBase.Success( new { results, count = results.Count } );
    }
}
