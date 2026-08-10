package main

import (
    "fmt"
    "io"
    "os"
    "os/exec"
    "path/filepath"
    "strings"
    "syscall"
    "unsafe"
)

const appName = "Suno Pesme Studio"

func box(text, title string, flags uintptr) uintptr {
    user32 := syscall.NewLazyDLL("user32.dll")
    proc := user32.NewProc("MessageBoxW")
    t, _ := syscall.UTF16PtrFromString(text)
    c, _ := syscall.UTF16PtrFromString(title)
    r, _, _ := proc.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), flags)
    return r
}

func copyFile(src, dst string, mode os.FileMode) error {
    in, err := os.Open(src)
    if err != nil { return err }
    defer in.Close()
    if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil { return err }
    out, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, mode)
    if err != nil { return err }
    _, cp := io.Copy(out, in)
    closeErr := out.Close()
    if cp != nil { return cp }
    return closeErr
}

func copyDir(src, dst string) error {
    return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
        if err != nil { return err }
        rel, err := filepath.Rel(src, path)
        if err != nil { return err }
        target := filepath.Join(dst, rel)
        if info.IsDir() { return os.MkdirAll(target, info.Mode()) }
        return copyFile(path, target, info.Mode())
    })
}

func shortcut(link, target, work string) error {
    esc := func(s string) string { return strings.ReplaceAll(s, "'", "''") }
    script := fmt.Sprintf("$w=New-Object -ComObject WScript.Shell;$s=$w.CreateShortcut('%s');$s.TargetPath='%s';$s.WorkingDirectory='%s';$s.IconLocation='%s,0';$s.Save()", esc(link), esc(target), esc(work), esc(target))
    return exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script).Run()
}

func main() {
    exe, err := os.Executable()
    if err != nil { panic(err) }
    src := filepath.Join(filepath.Dir(exe), "Program")
    if st, err := os.Stat(src); err != nil || !st.IsDir() {
        box("Folder Program nije pronađen pored installera.", appName, 0x10); os.Exit(1)
    }
    local := os.Getenv("LOCALAPPDATA")
    if local == "" { box("LOCALAPPDATA nije dostupan.", appName, 0x10); os.Exit(1) }
    target := filepath.Join(local, "Programs", appName)
    temp := target + ".new"
    backup := target + ".old"
    _ = exec.Command("taskkill.exe", "/IM", "Suno Pesme Studio.exe", "/T", "/F").Run()
    _ = os.RemoveAll(temp)
    _ = os.RemoveAll(backup)
    if err := copyDir(src, temp); err != nil { box("Kopiranje programa nije uspelo: "+err.Error(), appName, 0x10); os.Exit(1) }
    if _, err := os.Stat(target); err == nil {
        if err := os.Rename(target, backup); err != nil { box("Stara instalacija ne može da se zameni: "+err.Error(), appName, 0x10); os.Exit(1) }
    }
    if err := os.Rename(temp, target); err != nil {
        _ = os.Rename(backup, target)
        box("Aktiviranje instalacije nije uspelo: "+err.Error(), appName, 0x10); os.Exit(1)
    }
    launcher := filepath.Join(target, "Suno Pesme Studio.exe")
    if _, err := os.Stat(launcher); err != nil {
        _ = os.RemoveAll(target); _ = os.Rename(backup, target)
        box("Glavni launcher nije pronađen posle instalacije.", appName, 0x10); os.Exit(1)
    }
    desktop := filepath.Join(os.Getenv("USERPROFILE"), "Desktop", appName+".lnk")
    start := filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs", appName+".lnk")
    _ = shortcut(desktop, launcher, target)
    _ = shortcut(start, launcher, target)
    _ = os.RemoveAll(backup)
    box("Suno Pesme Studio je instaliran. Pokrećem program.", appName, 0x40)
    _ = exec.Command(launcher).Start()
}
