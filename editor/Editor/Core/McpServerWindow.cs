using System;
using System.Collections.Generic;
using System.Linq;
using Editor;
using Sandbox;

namespace Arenula;

public class McpServerWindow : Widget
{
    private Label _statusLabel;
    private Label _portLabel;
    private Label _sessionCountLabel;
    private Button _toggleButton;
    private Widget _logCanvas;
    private ToggleSwitch _autoStartToggle;

    private static readonly List<string> _logEntries = new();
    private const int MaxLogEntries = 200;

    [ConVar( "mcp_server_autostart", ConVarFlags.Saved )]
    public static bool AutoStart { get; set; } = true;

    // Open via the Editor menu
    [Menu( "Editor", "MCP/Open MCP Panel" )]
    public static void OpenPanel()
    {
        var win = new McpServerWindow();
        win.Show();
    }

    // Static constructor runs once when the library assembly is loaded by the editor.
    static McpServerWindow()
    {
        if ( AutoStart && !ArenulaMcpServer.IsRunning )
        {
            ArenulaMcpServer.StartServer();
        }
    }

    public McpServerWindow() : base( null )
    {
        WindowTitle = "Arenula MCP Server";
        MinimumSize = new Vector2( 500, 400 );

        ArenulaMcpServer.OnServerStateChanged += OnStateChanged;
        ArenulaMcpServer.OnLogMessage += OnLogMessage;

        BuildUI();
        OnStateChanged();
    }

    public override void OnDestroyed()
    {
        ArenulaMcpServer.OnServerStateChanged -= OnStateChanged;
        ArenulaMcpServer.OnLogMessage -= OnLogMessage;
        base.OnDestroyed();
    }

    private void BuildUI()
    {
        var root = Layout.Column();
        root.Margin = 8;
        root.Spacing = 6;

        // ── Status Row ─────────────────────────────────────────────────
        var statusRow = Layout.Row();
        statusRow.Spacing = 16;

        var statusCol = Layout.Column();
        var statusTitle = new Label( "STATUS" );
        statusTitle.SetStyles( "font-size: 10px; color: #888;" );
        statusCol.Add( statusTitle );
        _statusLabel = new Label( "● Stopped" );
        _statusLabel.SetStyles( "font-size: 15px; font-weight: bold; color: #f87171;" );
        statusCol.Add( _statusLabel );
        statusRow.Add( statusCol );

        var portCol = Layout.Column();
        var portTitle = new Label( "PORT" );
        portTitle.SetStyles( "font-size: 10px; color: #888;" );
        portCol.Add( portTitle );
        _portLabel = new Label( ArenulaMcpServer.Port.ToString() );
        _portLabel.SetStyles( "font-size: 15px; font-weight: bold;" );
        portCol.Add( _portLabel );
        statusRow.Add( portCol );

        var sessionCol = Layout.Column();
        var sessionTitle = new Label( "SESSIONS" );
        sessionTitle.SetStyles( "font-size: 10px; color: #888;" );
        sessionCol.Add( sessionTitle );
        _sessionCountLabel = new Label( "0" );
        _sessionCountLabel.SetStyles( "font-size: 15px; font-weight: bold;" );
        sessionCol.Add( _sessionCountLabel );
        statusRow.Add( sessionCol );

        statusRow.AddStretchCell();

        _toggleButton = new Button( "Start MCP Server", "play_arrow" );
        _toggleButton.Clicked += ToggleServer;
        statusRow.Add( _toggleButton );

        root.Add( statusRow );

        // ── Auto-start Row ─────────────────────────────────────────────
        var autoRow = Layout.Row();
        autoRow.Spacing = 8;
        _autoStartToggle = new ToggleSwitch( "Auto-start MCP Server on editor load" );
        _autoStartToggle.Value = AutoStart;
        _autoStartToggle.ToolTip = $"mcp_server_autostart (default: true). Change takes effect on next editor launch.";
        _autoStartToggle.MouseClick += () =>
        {
            AutoStart = _autoStartToggle.Value;
        };
        autoRow.Add( _autoStartToggle );
        root.Add( autoRow );
        root.AddSeparator();

        // ── Log Header ─────────────────────────────────────────────────
        var logHeader = Layout.Row();
        var logTitle = new Label( "Activity Log" );
        logTitle.SetStyles( "font-weight: bold; font-size: 13px;" );
        logHeader.Add( logTitle );
        logHeader.AddStretchCell();

        var clearBtn = new Button( "", "delete_sweep" );
        clearBtn.ToolTip = "Clear Log";
        clearBtn.FixedWidth = 26;
        clearBtn.FixedHeight = 26;
        clearBtn.Clicked += () => { _logEntries.Clear(); _logCanvas.DestroyChildren(); };
        logHeader.Add( clearBtn );
        root.Add( logHeader );

        // ── Log Area ───────────────────────────────────────────────────
        var scroll = new ScrollArea( null );
        scroll.MinimumHeight = 250;

        _logCanvas = new Widget();
        _logCanvas.Layout = Layout.Column();
        scroll.Canvas = _logCanvas;

        foreach ( var entry in _logEntries )
        {
            AddLogLabel( entry );
        }

        root.Add( scroll, 1 );

        Layout = root;
    }

    private void AddLogLabel( string text )
    {
        var lbl = new Label( text );
        lbl.WordWrap = true;

        string color = "#e5e7eb";
        string weight = "normal";

        if ( text.Contains( "[ERROR]" ) )
        {
            color = "#f87171";
            weight = "bold";
        }
        else if ( text.Contains( "] Tool: " ) )
        {
            color = "#60a5fa";
            weight = "bold";
        }
        else if ( text.Contains( "Started" ) || text.Contains( "Created new MCP" ) || text.Contains( "initialized" ) )
        {
            color = "#4ade80";
        }
        else if ( text.Contains( "] Waiting for" ) || text.Contains( "] Resumed on" ) || text.Contains( "Closed MCP" ) || text.Contains( "Stopped" ) )
        {
            color = "#9ca3af";
        }

        lbl.SetStyles( $"font-family: monospace; font-size: 11px; padding: 2px; color: {color}; font-weight: {weight};" );
        _logCanvas.Layout.Add( lbl );
    }

    private void ToggleServer()
    {
        if ( ArenulaMcpServer.IsRunning )
            ArenulaMcpServer.StopServer();
        else
            ArenulaMcpServer.StartServer();
    }

    private void OnStateChanged()
    {
        if ( !IsValid ) return;

        _portLabel.Text = ArenulaMcpServer.Port.ToString();
        _sessionCountLabel.Text = ArenulaMcpServer.SessionCount.ToString();

        if ( ArenulaMcpServer.IsRunning )
        {
            _statusLabel.Text = "● Running";
            _statusLabel.SetStyles( "font-size: 15px; font-weight: bold; color: #4ade80;" );
            _toggleButton.Text = "Stop MCP Server";
        }
        else
        {
            _statusLabel.Text = "● Stopped";
            _statusLabel.SetStyles( "font-size: 15px; font-weight: bold; color: #f87171;" );
            _toggleButton.Text = "Start MCP Server";
        }
    }

    private void OnLogMessage( string message )
    {
        if ( !IsValid ) return;

        var text = $"[{DateTime.Now:HH:mm:ss}] {message}";
        _logEntries.Add( text );

        AddLogLabel( text );

        if ( _logEntries.Count > MaxLogEntries )
        {
            _logEntries.RemoveAt( 0 );

            var firstChild = _logCanvas.Children.FirstOrDefault();
            firstChild?.Destroy();
        }
    }
}
