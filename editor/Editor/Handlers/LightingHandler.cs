using System.Text.Json;

namespace Arenula;

internal static class LightingHandler
{
    internal static object Handle( string action, JsonElement args )
    {
        return action switch
        {
            _ => HandlerBase.Error( $"Action '{action}' not yet implemented.", action, "Available in Phase 5." )
        };
    }
}
