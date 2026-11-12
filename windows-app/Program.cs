using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace KoinCLICK
{
    internal static class Program
    {
        [STAThread]
        static void Main()
        {
            ApplicationConfiguration.Initialize();
            Application.Run(new MainForm());
        }
    }

    public class MainForm : Form
    {
        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

        private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
        private readonly WebView2 _webView;
        private HttpListener? _httpServer;
        private CancellationTokenSource? _cts;
        private readonly string _wwwRoot;
        private const int LocalPort = 45173;

        public MainForm()
        {
            Text = "KoinCLICK — Smart Multi-Currency Budget Manager";
            Width = 1400;
            Height = 900;
            MinimumSize = new Size(980, 680);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(2, 6, 23); // slate-950
            ForeColor = Color.White;
            Icon = CreateBrandIcon();

            _wwwRoot = Path.Combine(AppContext.BaseDirectory, "www");

            _webView = new WebView2
            {
                Dock = DockStyle.Fill,
                DefaultBackgroundColor = Color.FromArgb(2, 6, 23)
            };
            Controls.Add(_webView);

            Load += OnFormLoad;
            FormClosing += OnFormClosing;
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            int useDarkMode = 1;
            DwmSetWindowAttribute(Handle, DWMWA_USE_IMMERSIVE_DARK_MODE, ref useDarkMode, sizeof(int));
        }

        private async void OnFormLoad(object? sender, EventArgs e)
        {
            StartEmbeddedWebServer();

            string userDataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "KoinCLICK",
                "WebView2Data"
            );
            Directory.CreateDirectory(userDataDir);

            var env = await CoreWebView2Environment.CreateAsync(null, userDataDir);
            await _webView.EnsureCoreWebView2Async(env);

            _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
            _webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
            _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            _webView.CoreWebView2.Settings.IsZoomControlEnabled = true;

            _webView.CoreWebView2.Navigate($"http://127.0.0.1:{LocalPort}/");
        }

        private void StartEmbeddedWebServer()
        {
            try
            {
                _cts = new CancellationTokenSource();
                _httpServer = new HttpListener();
                _httpServer.Prefixes.Add($"http://127.0.0.1:{LocalPort}/");
                _httpServer.Start();

                Task.Run(async () =>
                {
                    while (_httpServer.IsListening && !_cts.IsCancellationRequested)
                    {
                        try
                        {
                            var ctx = await _httpServer.GetContextAsync();
                            _ = Task.Run(() => HandleHttpRequest(ctx));
                        }
                        catch
                        {
                            break;
                        }
                    }
                });
            }
            catch
            {
                // If another instance is already serving on LocalPort, WebView2 will connect to it.
            }
        }

        private void HandleHttpRequest(HttpListenerContext ctx)
        {
            try
            {
                string reqPath = ctx.Request.Url?.AbsolutePath.TrimStart('/') ?? "";
                if (string.IsNullOrEmpty(reqPath)) reqPath = "index.html";

                string filePath = Path.GetFullPath(Path.Combine(_wwwRoot, reqPath));
                if (!filePath.StartsWith(Path.GetFullPath(_wwwRoot), StringComparison.OrdinalIgnoreCase) ||
                    !File.Exists(filePath))
                {
                    filePath = Path.Combine(_wwwRoot, "index.html");
                }

                byte[] bytes = File.ReadAllBytes(filePath);
                ctx.Response.ContentType = GetMimeType(Path.GetExtension(filePath));
                ctx.Response.ContentLength64 = bytes.Length;
                ctx.Response.StatusCode = 200;
                ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
                ctx.Response.OutputStream.Close();
            }
            catch
            {
                try
                {
                    ctx.Response.StatusCode = 404;
                    ctx.Response.Close();
                }
                catch { }
            }
        }

        private static string GetMimeType(string ext) => ext.ToLowerInvariant() switch
        {
            ".html" => "text/html; charset=utf-8",
            ".js" => "application/javascript; charset=utf-8",
            ".css" => "text/css; charset=utf-8",
            ".json" => "application/json; charset=utf-8",
            ".svg" => "image/svg+xml",
            ".png" => "image/png",
            ".ico" => "image/x-icon",
            _ => "application/octet-stream"
        };

        private void OnFormClosing(object? sender, FormClosingEventArgs e)
        {
            try
            {
                _cts?.Cancel();
                _httpServer?.Stop();
                _httpServer?.Close();
            }
            catch { }
        }

        private static Icon CreateBrandIcon()
        {
            using var bmp = new Bitmap(64, 64);
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                using var bgBrush = new LinearGradientBrush(
                    new Rectangle(0, 0, 64, 64),
                    Color.FromArgb(16, 185, 129), // emerald-500
                    Color.FromArgb(5, 150, 105),  // emerald-600
                    45f
                );
                g.FillEllipse(bgBrush, 4, 4, 56, 56);

                using var ringPen = new Pen(Color.FromArgb(245, 158, 11), 3f); // amber-500
                g.DrawEllipse(ringPen, 10, 10, 44, 44);

                using var font = new Font("Segoe UI", 24, FontStyle.Bold, GraphicsUnit.Pixel);
                using var textBrush = new SolidBrush(Color.FromArgb(2, 6, 23));
                var sf = new StringFormat
                {
                    Alignment = StringAlignment.Center,
                    LineAlignment = StringAlignment.Center
                };
                g.DrawString("K", font, textBrush, new RectangleF(0, 1, 64, 64), sf);
            }
            return Icon.FromHandle(bmp.GetHicon());
        }
    }
}
