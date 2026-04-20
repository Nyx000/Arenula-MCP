using System.Linq;
using Sandbox;

namespace Arenula;

/// <summary>
/// Helper utilities for material loading and application operations on PolygonMesh.
/// Provides centralized methods for material handling in mesh editing tools.
/// </summary>
internal static class MaterialHelper
{
    private const string DefaultMaterialPath = "materials/dev/reflectivity_30.vmat";

    internal static Material LoadMaterial( string materialPath )
    {
        if ( string.IsNullOrEmpty( materialPath ) )
            return null;
        try
        {
            return Material.Load( materialPath );
        }
        catch
        {
            return null;
        }
    }

    internal static Material LoadMaterialOrDefault( string materialPath )
    {
        var material = LoadMaterial( materialPath );
        if ( material != null )
            return material;
        return Material.Load( DefaultMaterialPath );
    }

    internal static bool ApplyMaterialToFace( PolygonMesh mesh, int faceIndex, Material material )
    {
        if ( mesh == null || material == null )
            return false;
        try
        {
            var faceHandle = mesh.FaceHandleFromIndex( faceIndex );
            if ( !faceHandle.IsValid )
                return false;
            mesh.SetFaceMaterial( faceHandle, material );
            return true;
        }
        catch
        {
            return false;
        }
    }

    internal static bool ApplyMaterialToFace( PolygonMesh mesh, int faceIndex, string materialPath )
    {
        var material = LoadMaterial( materialPath );
        if ( material == null )
            return false;
        return ApplyMaterialToFace( mesh, faceIndex, material );
    }

    internal static bool SetTextureParameters( PolygonMesh mesh, int faceIndex,
        Vector3 vAxisU, Vector3 vAxisV, Vector2 scale )
    {
        if ( mesh == null )
            return false;
        try
        {
            var faceHandle = mesh.FaceHandleFromIndex( faceIndex );
            if ( !faceHandle.IsValid )
                return false;
            mesh.SetFaceTextureParameters( faceHandle, vAxisU, vAxisV, scale );
            return true;
        }
        catch
        {
            return false;
        }
    }

    internal static Material GetFaceMaterial( PolygonMesh mesh, int faceIndex )
    {
        if ( mesh == null )
            return null;
        try
        {
            var faceHandle = mesh.FaceHandleFromIndex( faceIndex );
            if ( !faceHandle.IsValid )
                return null;
            return mesh.GetFaceMaterial( faceHandle );
        }
        catch
        {
            return null;
        }
    }

    internal static int GetFaceCount( PolygonMesh mesh )
        => mesh?.FaceHandles?.Count() ?? 0;

    internal static int GetVertexCount( PolygonMesh mesh )
        => mesh?.VertexHandles?.Count() ?? 0;

    internal static int GetEdgeCount( PolygonMesh mesh )
        => mesh?.HalfEdgeHandles?.Count() ?? 0;
}
