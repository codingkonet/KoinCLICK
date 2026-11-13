using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace KoinClickSetup;

internal static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new SetupForm());
    }
}

public sealed class SetupForm : Form
{
    private readonly TextBox _pathBox;
    private readonly CheckBox _desktopCheck;
    private readonly CheckBox _startMenuCheck;
    private readonly CheckBox _launchCheck;
    private readonly ProgressBar _progress;
    private readonly Label _statusLabel;
    private readonly Button _installBtn;
    private readonly Button _browseBtn;

    private static readonly Color BgDark = Color.FromArgb(9, 9, 11);
    private static readonly Color CardDark = Color.FromArgb(24, 24, 27);
    private static readonly Color Indigo = Color.FromArgb(99, 102, 241);
    private static readonly Color BorderZinc = Color.FromArgb(63, 63, 70);

    public SetupForm()
    {
        Text = "KoinCLICK Setup — Windows Installer";
        Size = new Size(540, 410);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = BgDark;
        ForeColor = Color.White;
        Font = new Font("Segoe UI", 9.5f);

        var header = new Panel
        {
            Dock = DockStyle.Top,
            Height = 84,
            BackColor = CardDark,
            Padding = new Padding(22, 16, 22, 12)
        };

        var title = new Label
        {
            Text = "KoinCLICK Desktop Setup",
            Font = new Font("Segoe UI", 15f, FontStyle.Bold),
            ForeColor = Color.White,
            AutoSize = true,
            Location = new Point(22, 16)
        };

        var subtitle = new Label
        {
            Text = "Multi-Currency & AI Budget Manager • v1.0.0 (Windows x64)",
            Font = new Font("Segoe UI", 9f),
            ForeColor = Color.FromArgb(161, 161, 170),
            AutoSize = true,
            Location = new Point(24, 48)
        };

        header.Controls.Add(title);
        header.Controls.Add(subtitle);
        Controls.Add(header);

        var defaultDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Programs",
            "KoinCLICK"
        );

        var pathTitle = new Label
        {
            Text = "Install Location",
            ForeColor = Color.FromArgb(212, 212, 216),
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(24, 104)
        };
        Controls.Add(pathTitle);

        _pathBox = new TextBox
        {
            Text = defaultDir,
            Location = new Point(24, 128),
            Size = new Size(388, 28),
            BackColor = CardDark,
            ForeColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle
        };
        Controls.Add(_pathBox);

        _browseBtn = new Button
        {
            Text = "Browse...",
            Location = new Point(420, 127),
            Size = new Size(88, 28),
            FlatStyle = FlatStyle.Flat,
            BackColor = CardDark,
            ForeColor = Color.White,
            Cursor = Cursors.Hand
        };
        _browseBtn.FlatAppearance.BorderColor = BorderZinc;
        _browseBtn.Click += (_, _) =>
        {
            using var dlg = new FolderBrowserDialog { SelectedPath = _pathBox.Text };
            if (dlg.ShowDialog(this) == DialogResult.OK)
            {
                _pathBox.Text = Path.Combine(dlg.SelectedPath, "KoinCLICK");
            }
        };
        Controls.Add(_browseBtn);

        _desktopCheck = new CheckBox
        {
            Text = "Create Desktop shortcut",
            Checked = true,
            AutoSize = true,
            Location = new Point(24, 174),
            ForeColor = Color.FromArgb(228, 228, 231)
        };
        Controls.Add(_desktopCheck);

        _startMenuCheck = new CheckBox
        {
            Text = "Create Start Menu shortcut & register in Windows Installed Apps",
            Checked = true,
            AutoSize = true,
            Location = new Point(24, 202),
            ForeColor = Color.FromArgb(228, 228, 231)
        };
        Controls.Add(_startMenuCheck);

        _launchCheck = new CheckBox
        {
            Text = "Launch KoinCLICK after installation",
            Checked = true,
            AutoSize = true,
            Location = new Point(24, 230),
            ForeColor = Color.FromArgb(228, 228, 231)
        };
        Controls.Add(_launchCheck);

        _statusLabel = new Label
        {
            Text = "Ready to install KoinCLICK on your PC.",
            ForeColor = Color.FromArgb(161, 161, 170),
            AutoSize = false,
            Size = new Size(484, 22),
            Location = new Point(24, 272)
        };
        Controls.Add(_statusLabel);

        _progress = new ProgressBar
        {
            Location = new Point(24, 298),
            Size = new Size(484, 14),
            Style = ProgressBarStyle.Continuous,
            Minimum = 0,
            Maximum = 100
        };
        Controls.Add(_progress);

        _installBtn = new Button
        {
            Text = "Install KoinCLICK",
            Location = new Point(348, 326),
            Size = new Size(160, 36),
            FlatStyle = FlatStyle.Flat,
            BackColor = Indigo,
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            Cursor = Cursors.Hand
        };
        _installBtn.FlatAppearance.BorderSize = 0;
        _installBtn.Click += async (_, _) => await RunInstallAsync();
        Controls.Add(_installBtn);

        var cancelBtn = new Button
        {
            Text = "Cancel",
            Location = new Point(252, 326),
            Size = new Size(88, 36),
            FlatStyle = FlatStyle.Flat,
            BackColor = CardDark,
            ForeColor = Color.White,
            Cursor = Cursors.Hand
        };
        cancelBtn.FlatAppearance.BorderColor = BorderZinc;
        cancelBtn.Click += (_, _) => Close();
        Controls.Add(cancelBtn);
    }

    private async Task RunInstallAsync()
    {
        var installDir = _pathBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(installDir))
        {
            MessageBox.Show(this, "Please choose a valid install folder.", "KoinCLICK Setup",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _installBtn.Enabled = false;
        _browseBtn.Enabled = false;
        _pathBox.Enabled = false;

        try
        {
            _statusLabel.Text = "Preparing installation folder...";
            _progress.Value = 15;

            await Task.Run(() =>
            {
                Directory.CreateDirectory(installDir);

                using var stream = Assembly.GetExecutingAssembly()
                    .GetManifestResourceStream("KoinCLICK.payload.zip")
                    ?? throw new InvalidOperationException("Embedded payload not found.");

                using var archive = new ZipArchive(stream, ZipArchiveMode.Read);
                int total = Math.Max(1, archive.Entries.Count);
                int done = 0;

                foreach (var entry in archive.Entries)
                {
                    var destPath = Path.GetFullPath(Path.Combine(installDir, entry.FullName));
                    if (!destPath.StartsWith(Path.GetFullPath(installDir), StringComparison.OrdinalIgnoreCase))
                        continue;

                    if (string.IsNullOrEmpty(entry.Name))
                    {
                        Directory.CreateDirectory(destPath);
                    }
                    else
                    {
                        Directory.CreateDirectory(Path.GetDirectoryName(destPath)!);
                        entry.ExtractToFile(destPath, overwrite: true);
                    }

                    done++;
                    int pct = 15 + (int)(done * 65.0 / total);
                    BeginInvoke(() => _progress.Value = Math.Min(80, pct));
                }
            });

            var exePath = Path.Combine(installDir, "KoinCLICK.exe");

            _statusLabel.Text = "Creating shortcuts & uninstaller...";
            _progress.Value = 88;

            WriteUninstaller(installDir);

            if (_desktopCheck.Checked)
            {
                var desktopLnk = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                    "KoinCLICK.lnk"
                );
                CreateShortcut(desktopLnk, exePath, installDir, "KoinCLICK Budget Manager");
            }

            if (_startMenuCheck.Checked)
            {
                var startFolder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.Programs),
                    "KoinCLICK"
                );
                Directory.CreateDirectory(startFolder);
                CreateShortcut(Path.Combine(startFolder, "KoinCLICK.lnk"), exePath, installDir, "KoinCLICK Budget Manager");
                CreateShortcut(
                    Path.Combine(startFolder, "Uninstall KoinCLICK.lnk"),
                    Path.Combine(installDir, "Uninstall.cmd"),
                    installDir,
                    "Uninstall KoinCLICK"
                );
                RegisterUninstaller(installDir);
            }

            _progress.Value = 100;
            _statusLabel.Text = "Installation complete!";

            if (_launchCheck.Checked && File.Exists(exePath))
            {
                Process.Start(new ProcessStartInfo(exePath) { UseShellExecute = true });
            }
            else
            {
                MessageBox.Show(this, $"KoinCLICK was installed to:\n{installDir}", "KoinCLICK Setup",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
            }

            Close();
        }
        catch (Exception ex)
        {
            _statusLabel.Text = "Installation failed.";
            MessageBox.Show(this, $"Setup failed:\n{ex.Message}", "KoinCLICK Setup",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            _installBtn.Enabled = true;
            _browseBtn.Enabled = true;
            _pathBox.Enabled = true;
        }
    }

    private static void CreateShortcut(string shortcutPath, string targetPath, string workingDir, string description)
    {
        var shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType == null) return;
        dynamic shell = Activator.CreateInstance(shellType)!;
        dynamic shortcut = shell.CreateShortcut(shortcutPath);
        shortcut.TargetPath = targetPath;
        shortcut.WorkingDirectory = workingDir;
        shortcut.Description = description;
        shortcut.Save();
    }

    private static void WriteUninstaller(string installDir)
    {
        var ps1Path = Path.Combine(installDir, "Uninstall.ps1");
        var cmdPath = Path.Combine(installDir, "Uninstall.cmd");

        var ps1 = $@"
$ErrorActionPreference = 'SilentlyContinue'
Stop-Process -Name 'KoinCLICK' -Force
$desktopLnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'KoinCLICK.lnk'
if (Test-Path $desktopLnk) {{ Remove-Item $desktopLnk -Force }}
$startDir = Join-Path ([Environment]::GetFolderPath('Programs')) 'KoinCLICK'
if (Test-Path $startDir) {{ Remove-Item $startDir -Recurse -Force }}
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\KoinCLICK' -Force
Start-Sleep -Milliseconds 300
Start-Process cmd.exe -ArgumentList '/c timeout /t 2 /nobreak >nul & rmdir /s /q ""{installDir}""' -WindowStyle Hidden
";
        File.WriteAllText(ps1Path, ps1.TrimStart());
        File.WriteAllText(cmdPath, $"@echo off\r\npowershell -ExecutionPolicy Bypass -File \"{ps1Path}\"\r\n");
    }

    private static void RegisterUninstaller(string installDir)
    {
        using var key = Registry.CurrentUser.CreateSubKey(
            @"Software\Microsoft\Windows\CurrentVersion\Uninstall\KoinCLICK"
        );
        key?.SetValue("DisplayName", "KoinCLICK Budget Manager");
        key?.SetValue("DisplayVersion", "1.0.0");
        key?.SetValue("Publisher", "KoinCLICK");
        key?.SetValue("InstallLocation", installDir);
        key?.SetValue("UninstallString", $"\"{Path.Combine(installDir, "Uninstall.cmd")}\"");
        key?.SetValue("NoModify", 1, RegistryValueKind.DWord);
        key?.SetValue("NoRepair", 1, RegistryValueKind.DWord);
    }
}
