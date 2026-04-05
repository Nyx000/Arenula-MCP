// Editor/Handlers/EffectsHandler.cs
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Editor;
using Sandbox;

namespace Arenula;

/// <summary>
/// effects tool: create, configure_particle, configure_post_processing.
/// Consolidates Ozmium CreateParticleEffect, CreateFogVolume, CreateBeamEffect,
/// CreateVerletRope, CreateRadiusDamage, CreateRenderEntity into 'create' with type param.
/// Ported from EffectToolHandlers.cs (641 lines, minus CreateJoint moved to physics).
/// </summary>
internal static class EffectsHandler
{
    internal static object Handle( string action, JsonElement args )
    {
        try
        {
            return action switch
            {
                "create"                   => Create( args ),
                "configure_particle"       => ConfigureParticle( args ),
                "configure_post_processing" => ConfigurePostProcessing( args ),
                _ => HandlerBase.Error( $"Unknown action '{action}'", action,
                    "Valid actions: create, configure_particle, configure_post_processing" )
            };
        }
        catch ( Exception ex )
        {
            return HandlerBase.Error( ex.Message, action );
        }
    }

    // ── create ────────────────────────────────────────────────────────
    // Consolidates: CreateParticleEffect, CreateFogVolume, CreateBeamEffect,
    //               CreateVerletRope, CreateRadiusDamage, CreateRenderEntity

    private static object Create( JsonElement args )
    {
        var scene = SceneHelpers.ResolveScene();
        if ( scene == null )
            return HandlerBase.Error( "No active scene.", "create" );

        var type = HandlerBase.GetString( args, "type", "particle" );
        var posStr = HandlerBase.GetString( args, "position" );
        var position = posStr != null ? HandlerBase.ParseVector3( posStr ) : Vector3.Zero;

        return type.ToLowerInvariant() switch
        {
            "particle"       => CreateParticle( scene, args, position ),
            "fog"            => CreateFog( scene, args, position ),
            "beam"           => CreateBeam( scene, args, position ),
            "rope"           => CreateRope( scene, args, position ),
            "radius_damage"  => CreateRadiusDamage( scene, args, position ),
            "render_entity"  => CreateRenderEntity( scene, args, position ),
            _ => HandlerBase.Error(
                $"Unknown effect type '{type}'.",
                "create",
                "Valid types: particle, fog, beam, rope, radius_damage, render_entity" )
        };
    }

    private static object CreateParticle( Scene scene, JsonElement args, Vector3 position )
    {
        var go = scene.CreateObject();
        go.Name = HandlerBase.GetString( args, "name" ) ?? "Particle Effect";
        go.WorldPosition = position;

        var pe = go.Components.Create<ParticleEffect>();
        pe.MaxParticles = HandlerBase.GetInt( args, "max_particles", 1000 );
        if ( args.TryGetProperty( "lifetime", out var ltEl ) && ltEl.ValueKind == JsonValueKind.Number )
            pe.Lifetime = ltEl.GetSingle();
        if ( args.TryGetProperty( "time_scale", out var tsEl ) && tsEl.ValueKind == JsonValueKind.Number )
            pe.TimeScale = tsEl.GetSingle();
        if ( args.TryGetProperty( "pre_warm", out var pwEl ) && pwEl.ValueKind == JsonValueKind.Number )
            pe.PreWarm = pwEl.GetSingle();

        return HandlerBase.Success( new
        {
            message = $"Created ParticleEffect '{go.Name}'.",
            id = go.Id.ToString(),
            name = go.Name,
            position = HandlerBase.V3( go.WorldPosition )
        } );
    }

    private static object CreateFog( Scene scene, JsonElement args, Vector3 position )
    {
        var go = scene.CreateObject();
        go.Name = HandlerBase.GetString( args, "name" ) ?? "Fog Volume";
        go.WorldPosition = position;

        var fogType = HandlerBase.GetString( args, "fog_type", "gradient" );

        if ( fogType.Equals( "volumetric", StringComparison.OrdinalIgnoreCase ) )
        {
            var vf = go.Components.Create<VolumetricFogVolume>();
            if ( args.TryGetProperty( "strength", out var sEl ) && sEl.ValueKind == JsonValueKind.Number )
                vf.Strength = sEl.GetSingle();
            if ( args.TryGetProperty( "falloff_exponent", out var feEl ) && feEl.ValueKind == JsonValueKind.Number )
                vf.FalloffExponent = feEl.GetSingle();
            vf.Bounds = BBox.FromPositionAndSize( 0, 300 );
        }
        else
        {
            var gf = go.Components.Create<GradientFog>();
            gf.Color = Color.White;
            if ( args.TryGetProperty( "height", out var hEl ) && hEl.ValueKind == JsonValueKind.Number )
                gf.Height = hEl.GetSingle();
            if ( args.TryGetProperty( "start_distance", out var sdEl ) && sdEl.ValueKind == JsonValueKind.Number )
                gf.StartDistance = sdEl.GetSingle();
            if ( args.TryGetProperty( "end_distance", out var edEl ) && edEl.ValueKind == JsonValueKind.Number )
                gf.EndDistance = edEl.GetSingle();
            if ( args.TryGetProperty( "falloff_exponent", out var feEl ) && feEl.ValueKind == JsonValueKind.Number )
                gf.FalloffExponent = feEl.GetSingle();
            if ( args.TryGetProperty( "vertical_falloff_exponent", out var vfeEl ) && vfeEl.ValueKind == JsonValueKind.Number )
                gf.VerticalFalloffExponent = vfeEl.GetSingle();
            var colorStr = HandlerBase.GetString( args, "color" );
            if ( !string.IsNullOrEmpty( colorStr ) )
            {
                try { gf.Color = Color.Parse( colorStr ) ?? default; } catch { }
            }
        }

        return HandlerBase.Success( new
        {
            message = $"Created {fogType} fog on '{go.Name}'.",
            id = go.Id.ToString(),
            name = go.Name,
            position = HandlerBase.V3( go.WorldPosition )
        } );
    }

    private static object CreateBeam( Scene scene, JsonElement args, Vector3 position )
    {
        var go = scene.CreateObject();
        go.Name = HandlerBase.GetString( args, "name" ) ?? "Beam Effect";
        go.WorldPosition = position;

        var beam = go.Components.Create<BeamEffect>();
        if ( args.TryGetProperty( "scale", out var scEl ) && scEl.ValueKind == JsonValueKind.Number )
            beam.Scale = scEl.GetSingle();
        if ( args.TryGetProperty( "beams_per_second", out var bpsEl ) && bpsEl.ValueKind == JsonValueKind.Number )
            beam.BeamsPerSecond = bpsEl.GetSingle();
        beam.MaxBeams = HandlerBase.GetInt( args, "max_beams", 1 );
        beam.Looped = HandlerBase.GetBool( args, "looped", false );

        var targetPosStr = HandlerBase.GetString( args, "target_position" );
        if ( targetPosStr != null )
            beam.TargetPosition = HandlerBase.ParseVector3( targetPosStr );

        var targetId = HandlerBase.GetString( args, "target_id" );
        if ( !string.IsNullOrEmpty( targetId ) )
        {
            var targetGo = SceneHelpers.FindById( scene, targetId );
            if ( targetGo != null ) beam.TargetGameObject = targetGo;
        }

        return HandlerBase.Success( new
        {
            message = $"Created BeamEffect '{go.Name}'.",
            id = go.Id.ToString(),
            name = go.Name,
            position = HandlerBase.V3( go.WorldPosition )
        } );
    }

    private static object CreateRope( Scene scene, JsonElement args, Vector3 position )
    {
        var go = scene.CreateObject();
        go.Name = HandlerBase.GetString( args, "name" ) ?? "Verlet Rope";
        go.WorldPosition = position;

        var rope = go.Components.Create<VerletRope>();
        rope.SegmentCount = HandlerBase.GetInt( args, "segment_count", 16 );
        if ( args.TryGetProperty( "slack", out var slEl ) && slEl.ValueKind == JsonValueKind.Number )
            rope.Slack = slEl.GetSingle();
        if ( args.TryGetProperty( "radius", out var rEl ) && rEl.ValueKind == JsonValueKind.Number )
            rope.Radius = rEl.GetSingle();
        if ( args.TryGetProperty( "stiffness", out var stEl ) && stEl.ValueKind == JsonValueKind.Number )
            rope.Stiffness = stEl.GetSingle();
        if ( args.TryGetProperty( "damping_factor", out var dfEl ) && dfEl.ValueKind == JsonValueKind.Number )
            rope.DampingFactor = dfEl.GetSingle();

        var attachId = HandlerBase.GetString( args, "attachment_id" );
        if ( !string.IsNullOrEmpty( attachId ) )
        {
            var attachGo = SceneHelpers.FindById( scene, attachId );
            if ( attachGo != null ) rope.Attachment = attachGo;
        }

        return HandlerBase.Success( new
        {
            message = $"Created VerletRope '{go.Name}'.",
            id = go.Id.ToString(),
            name = go.Name,
            position = HandlerBase.V3( go.WorldPosition )
        } );
    }

    private static object CreateRadiusDamage( Scene scene, JsonElement args, Vector3 position )
    {
        var go = scene.CreateObject();
        go.Name = HandlerBase.GetString( args, "name" ) ?? "Radius Damage";
        go.WorldPosition = position;

        var rd = go.Components.Create<RadiusDamage>();
        if ( args.TryGetProperty( "radius", out var rEl ) && rEl.ValueKind == JsonValueKind.Number )
            rd.Radius = rEl.GetSingle();
        if ( args.TryGetProperty( "damage_amount", out var daEl ) && daEl.ValueKind == JsonValueKind.Number )
            rd.DamageAmount = daEl.GetSingle();
        if ( args.TryGetProperty( "physics_force_scale", out var pfsEl ) && pfsEl.ValueKind == JsonValueKind.Number )
            rd.PhysicsForceScale = pfsEl.GetSingle();
        rd.DamageOnEnabled = HandlerBase.GetBool( args, "damage_on_enabled", true );
        rd.Occlusion = HandlerBase.GetBool( args, "occlusion", true );

        var damageTags = HandlerBase.GetString( args, "damage_tags" );
        if ( !string.IsNullOrEmpty( damageTags ) )
        {
            foreach ( var tag in damageTags.Split( ',', StringSplitOptions.RemoveEmptyEntries ) )
                rd.DamageTags.Add( tag.Trim() );
        }

        return HandlerBase.Success( new
        {
            message = $"Created RadiusDamage '{go.Name}'.",
            id = go.Id.ToString(),
            name = go.Name,
            position = HandlerBase.V3( go.WorldPosition ),
            radius = rd.Radius,
            damage = rd.DamageAmount
        } );
    }

    private static object CreateRenderEntity( Scene scene, JsonElement args, Vector3 position )
    {
        // Delegates to RenderingToolHandlers-equivalent logic
        // Supports: text, line, sprite, trail, model_renderer, skinned_model, screen_panel
        var renderType = HandlerBase.GetString( args, "render_type", "" );

        var go = scene.CreateObject();
        go.Name = HandlerBase.GetString( args, "name" ) ?? "Render Entity";
        go.WorldPosition = position;

        switch ( renderType.ToLowerInvariant() )
        {
            case "text":
            {
                var tr = go.Components.Create<TextRenderer>();
                tr.Text = HandlerBase.GetString( args, "text", tr.Text );
                var colorStr = HandlerBase.GetString( args, "color" );
                if ( !string.IsNullOrEmpty( colorStr ) )
                {
                    try { tr.Color = Color.Parse( colorStr ) ?? default; } catch { }
                }
                break;
            }
            case "trail":
            {
                var trail = go.Components.Create<TrailRenderer>();
                trail.MaxPoints = HandlerBase.GetInt( args, "max_points", trail.MaxPoints );
                trail.Emitting = HandlerBase.GetBool( args, "emitting", trail.Emitting );
                break;
            }
            case "line":
                go.Components.Create<LineRenderer>();
                break;
            case "model_renderer":
            {
                var mr = go.Components.Create<ModelRenderer>();
                var modelPath = HandlerBase.GetString( args, "model_path" );
                if ( !string.IsNullOrEmpty( modelPath ) )
                {
                    var model = Model.Load( modelPath );
                    if ( model != null ) mr.Model = model;
                }
                break;
            }
            case "skinned_model":
            {
                var sk = go.Components.Create<SkinnedModelRenderer>();
                var modelPath = HandlerBase.GetString( args, "model_path" );
                if ( !string.IsNullOrEmpty( modelPath ) )
                {
                    var model = Model.Load( modelPath );
                    if ( model != null ) sk.Model = model;
                }
                break;
            }
            case "screen_panel":
            {
                var sp = go.Components.Create<ScreenPanel>();
                if ( args.TryGetProperty( "opacity", out var opEl ) && opEl.ValueKind == JsonValueKind.Number )
                    sp.Opacity = opEl.GetSingle();
                break;
            }
            default:
                go.Destroy();
                return HandlerBase.Error(
                    $"Unknown render_type '{renderType}'.",
                    "create",
                    "For render_entity type, valid render_types: text, line, trail, model_renderer, skinned_model, screen_panel" );
        }

        return HandlerBase.Success( new
        {
            message = $"Created {renderType} render entity '{go.Name}'.",
            id = go.Id.ToString(),
            name = go.Name,
            position = HandlerBase.V3( go.WorldPosition )
        } );
    }

    // ── configure_particle ────────────────────────────────────────────
    // Ported from EffectToolHandlers.ConfigureParticleEffect

    private static object ConfigureParticle( JsonElement args )
    {
        var scene = SceneHelpers.ResolveScene();
        if ( scene == null )
            return HandlerBase.Error( "No active scene.", "configure_particle" );

        var id = HandlerBase.GetString( args, "id" );
        if ( string.IsNullOrEmpty( id ) )
            return HandlerBase.Error( "Missing required 'id' parameter.", "configure_particle" );

        var go = SceneHelpers.FindByIdOrThrow( scene, id, "configure_particle" );
        var pe = go.Components.Get<ParticleEffect>();
        if ( pe == null )
            return HandlerBase.Error( $"No ParticleEffect component found on '{go.Name}'.", "configure_particle" );

        if ( args.TryGetProperty( "max_particles", out var mpEl ) && mpEl.ValueKind == JsonValueKind.Number )
            pe.MaxParticles = mpEl.GetInt32();
        if ( args.TryGetProperty( "lifetime", out var ltEl ) && ltEl.ValueKind == JsonValueKind.Number )
            pe.Lifetime = ltEl.GetSingle();
        if ( args.TryGetProperty( "time_scale", out var tsEl ) && tsEl.ValueKind == JsonValueKind.Number )
            pe.TimeScale = tsEl.GetSingle();
        if ( args.TryGetProperty( "pre_warm", out var pwEl ) && pwEl.ValueKind == JsonValueKind.Number )
            pe.PreWarm = pwEl.GetSingle();

        return HandlerBase.Confirm( $"Configured ParticleEffect on '{go.Name}'." );
    }

    // ── configure_post_processing ─────────────────────────────────────
    // Ported from EffectToolHandlers.ConfigurePostProcessing

    private static object ConfigurePostProcessing( JsonElement args )
    {
        var scene = SceneHelpers.ResolveScene();
        if ( scene == null )
            return HandlerBase.Error( "No active scene.", "configure_post_processing" );

        var id = HandlerBase.GetString( args, "id" );
        if ( string.IsNullOrEmpty( id ) )
            return HandlerBase.Error( "Missing required 'id' parameter.", "configure_post_processing" );

        var go = SceneHelpers.FindByIdOrThrow( scene, id, "configure_post_processing" );

        // ConfigurePostProcessing in Ozmium creates a new PostProcessVolume if not present
        var pp = go.Components.Get<PostProcessVolume>();
        if ( pp == null )
            pp = go.Components.Create<PostProcessVolume>();

        pp.Priority = HandlerBase.GetInt( args, "priority", pp.Priority );
        if ( args.TryGetProperty( "blend_weight", out var bwEl ) && bwEl.ValueKind == JsonValueKind.Number )
            pp.BlendWeight = bwEl.GetSingle();
        if ( args.TryGetProperty( "blend_distance", out var bdEl ) && bdEl.ValueKind == JsonValueKind.Number )
            pp.BlendDistance = bdEl.GetSingle();
        pp.EditorPreview = HandlerBase.GetBool( args, "editor_preview", pp.EditorPreview );

        return HandlerBase.Confirm( $"Configured PostProcessVolume on '{go.Name}'." );
    }
}
