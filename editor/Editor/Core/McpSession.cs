using System.Net;
using System.Threading.Tasks;

namespace Arenula;

/// <summary>Per-connection SSE session state.</summary>
public class McpSession
{
    public string SessionId { get; set; }
    public HttpListenerResponse SseResponse { get; set; }
    public TaskCompletionSource<bool> Tcs { get; set; } = new();
    public bool Initialized { get; set; }
}
