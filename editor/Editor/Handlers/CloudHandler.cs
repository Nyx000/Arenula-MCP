using System.Text.Json;
using System.Threading.Tasks;

namespace Arenula;

internal static class CloudHandler
{
    internal static Task<object> HandleAsync( string action, JsonElement args )
    {
        object result = action switch
        {
            _ => HandlerBase.Error( $"Action '{action}' not yet implemented.", action, "Available in Phase 6." )
        };
        return Task.FromResult( result );
    }
}
