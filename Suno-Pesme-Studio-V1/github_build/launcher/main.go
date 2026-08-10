package main

import (
    "fmt"
    "net/http"
    "os"
    "os/exec"
    "path/filepath"
    "strconv"
    "strings"
    "syscall"
    "time"
    "unsafe"

    webview2 "github.com/jchv/go-webview2"
)

const appName = "Suno Pesme Studio"

func findPython(root string) (string, error) {
    bundled := filepath.Join(root, "python", "python.exe")
    if st, err := os.Stat(bundled); err == nil && !st.IsDir() {
        return bundled, nil
    }
    if p, err := exec.LookPath("py.exe"); err == nil {
        return p, nil
    }
    if p, err := exec.LookPath("python.exe"); err == nil {
        return p, nil
    }
    return "", fmt.Errorf("Python runtime nije pronađen")
}

func messageBox(text string, flags uintptr) {
    user32 := syscall.NewLazyDLL("user32.dll")
    proc := user32.NewProc("MessageBoxW")
    t, _ := syscall.UTF16PtrFromString(text)
    c, _ := syscall.UTF16PtrFromString(appName)
    proc.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), flags)
}

func hideConsoleWindow() {
    kernel32 := syscall.NewLazyDLL("kernel32.dll")
    getConsoleWindow := kernel32.NewProc("GetConsoleWindow")
    hwnd, _, _ := getConsoleWindow.Call()
    if hwnd == 0 {
        return
    }
    user32 := syscall.NewLazyDLL("user32.dll")
    showWindow := user32.NewProc("ShowWindow")
    showWindow.Call(hwnd, 0) // SW_HIDE
}

func processEnv(root string) []string {
    env := os.Environ()
    env = append(env, "SUNO_PROGRAM_ROOT="+root)
    env = append(env, "PYTHONPATH="+filepath.Join(root, "app"))
    // Desktop aplikacija sama poseduje prozor. Python server NIKADA ne sme automatski da otvara Chrome/Edge.
    env = append(env, "SUNO_AUTO_OPEN=0")
    env = append(env, "SUNO_DESKTOP_MODE=1")
    return env
}

func runBootstrap(py, root string, env []string) error {
    cmd := exec.Command(py, filepath.Join(root, "app", "bootstrap.py"))
    cmd.Dir = root
    cmd.Env = env
    cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
    out, err := cmd.CombinedOutput()
    if err != nil {
        return fmt.Errorf("bootstrap nije uspeo: %w (%s)", err, strings.TrimSpace(string(out)))
    }
    return nil
}

func appURL() string {
    port := 8765
    if raw := strings.TrimSpace(os.Getenv("SUNO_STUDIO_PORT")); raw != "" {
        if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 && parsed <= 65535 {
            port = parsed
        }
    }
    return fmt.Sprintf("http://127.0.0.1:%d/", port)
}

func ready(url string) bool {
    client := &http.Client{Timeout: 900 * time.Millisecond}
    resp, err := client.Get(url)
    if err != nil {
        return false
    }
    defer resp.Body.Close()
    return resp.StatusCode >= 200 && resp.StatusCode < 500
}

func startServer(py, root string, env []string, url string) (*exec.Cmd, bool, error) {
    // Ako je backend već pokrenut od postojeće instance, ne pravimo drugi proces.
    if ready(url) {
        return nil, false, nil
    }
    cmd := exec.Command(py, filepath.Join(root, "app", "server.py"))
    cmd.Dir = root
    cmd.Env = env
    cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
    if err := cmd.Start(); err != nil {
        return nil, false, fmt.Errorf("lokalni backend nije mogao da se pokrene: %w", err)
    }
    for i := 0; i < 80; i++ {
        if ready(url) {
            return cmd, true, nil
        }
        time.Sleep(125 * time.Millisecond)
    }
    _ = cmd.Process.Kill()
    _, _ = cmd.Process.Wait()
    return nil, false, fmt.Errorf("lokalni backend nije postao spreman na vreme")
}

func stopServer(cmd *exec.Cmd, owned bool) {
    if !owned || cmd == nil || cmd.Process == nil {
        return
    }
    _ = cmd.Process.Kill()
    _, _ = cmd.Process.Wait()
}

func selfTest(py, root string, env []string) error {
    code := "import sys; from pathlib import Path; root=Path(r'" + filepath.ToSlash(root) + "'); sys.path.insert(0, str(root/'app')); import bootstrap, audio_tools, audio_match"
    cmd := exec.Command(py, "-c", code)
    cmd.Dir = root
    cmd.Env = env
    cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
    if out, err := cmd.CombinedOutput(); err != nil {
        return fmt.Errorf("embedded Python import test nije uspeo: %w (%s)", err, strings.TrimSpace(string(out)))
    }

    url := appURL()
    server, owned, err := startServer(py, root, env, url)
    if err != nil {
        return err
    }
    defer stopServer(server, owned)
    if !ready(url) {
        return fmt.Errorf("backend HTTP provera nije prošla")
    }
    return nil
}

func runDesktop(url string) error {
    w := webview2.NewWithOptions(webview2.WebViewOptions{
        Debug:     false,
        AutoFocus: true,
        WindowOptions: webview2.WindowOptions{
            Title:  appName,
            Width:  1500,
            Height: 920,
            Center: true,
        },
    })
    if w == nil {
        return fmt.Errorf("Microsoft Edge WebView2 prozor nije mogao da se napravi")
    }
    defer w.Destroy()
    w.SetSize(1180, 720, webview2.HintMin)
    w.Navigate(url)
    w.Run()
    return nil
}

func main() {
    exe, err := os.Executable()
    if err != nil {
        messageBox("Ne mogu da odredim lokaciju programa: "+err.Error(), 0x10)
        os.Exit(1)
    }
    root := filepath.Dir(exe)
    py, err := findPython(root)
    if err != nil {
        messageBox(err.Error(), 0x10)
        os.Exit(1)
    }
    env := processEnv(root)

    if os.Getenv("SPS_LAUNCHER_SELF_TEST") == "1" {
        if err := selfTest(py, root, env); err != nil {
            fmt.Fprintln(os.Stderr, err.Error())
            os.Exit(2)
        }
        fmt.Println("SPS_LAUNCHER_SELF_TEST_OK")
        return
    }

    // Kada korisnik pokrene EXE, konzola se odmah sakriva. Ostaje samo pravi Windows prozor aplikacije.
    hideConsoleWindow()

    if err := runBootstrap(py, root, env); err != nil {
        messageBox(err.Error(), 0x10)
        os.Exit(1)
    }

    url := appURL()
    server, owned, err := startServer(py, root, env, url)
    if err != nil {
        messageBox(err.Error(), 0x10)
        os.Exit(1)
    }
    defer stopServer(server, owned)

    // Važno: ovde se NE pokreće Chrome/Edge. UI se prikazuje samo u sopstvenom WebView2 Windows prozoru.
    if err := runDesktop(url); err != nil {
        messageBox(err.Error(), 0x10)
        os.Exit(1)
    }
}
