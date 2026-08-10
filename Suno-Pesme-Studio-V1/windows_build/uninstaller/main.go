package main

import (
    "os"
    "os/exec"
    "path/filepath"
    "syscall"
    "unsafe"
)

const appName = "Suno Pesme Studio"

func box(text string, flags uintptr) uintptr {
    user32 := syscall.NewLazyDLL("user32.dll")
    proc := user32.NewProc("MessageBoxW")
    t, _ := syscall.UTF16PtrFromString(text)
    c, _ := syscall.UTF16PtrFromString(appName)
    r, _, _ := proc.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), flags)
    return r
}

func main() {
    if box("Deinstalirati Suno Pesme Studio?", 0x24) != 6 { return }
    local := os.Getenv("LOCALAPPDATA")
    target := filepath.Join(local, "Programs", appName)
    _ = exec.Command("taskkill.exe", "/IM", "Suno Pesme Studio.exe", "/T", "/F").Run()
    _ = os.Remove(filepath.Join(os.Getenv("USERPROFILE"), "Desktop", appName+".lnk"))
    _ = os.Remove(filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs", appName+".lnk"))
    script := "Start-Sleep -Seconds 2; Remove-Item -LiteralPath '" + target + "' -Recurse -Force -ErrorAction SilentlyContinue"
    _ = exec.Command("powershell.exe", "-NoProfile", "-WindowStyle", "Hidden", "-Command", script).Start()
    box("Deinstalacija je pokrenuta.", 0x40)
}
