package main

import (
    "fmt"
    "os"
    "os/exec"
    "path/filepath"
)

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

func run(py, root, script string, env []string) error {
    cmd := exec.Command(py, filepath.Join(root, "app", script))
    cmd.Dir = root
    cmd.Env = env
    cmd.Stdout = os.Stdout
    cmd.Stderr = os.Stderr
    cmd.Stdin = os.Stdin
    return cmd.Run()
}

func selfTest(py, root string, env []string) error {
    code := "import sys; from pathlib import Path; root=Path(r'" + filepath.ToSlash(root) + "'); sys.path.insert(0, str(root/'app')); import bootstrap, audio_tools, audio_match; print('SPS_LAUNCHER_SELF_TEST_OK')"
    cmd := exec.Command(py, "-c", code)
    cmd.Dir = root
    cmd.Env = env
    cmd.Stdout = os.Stdout
    cmd.Stderr = os.Stderr
    return cmd.Run()
}

func main() {
    exe, err := os.Executable()
    if err != nil {
        panic(err)
    }
    root := filepath.Dir(exe)
    py, err := findPython(root)
    if err != nil {
        panic(err)
    }
    env := os.Environ()
    env = append(env, "SUNO_PROGRAM_ROOT="+root)
    env = append(env, "PYTHONPATH="+filepath.Join(root, "app"))

    if os.Getenv("SPS_LAUNCHER_SELF_TEST") == "1" {
        if err := selfTest(py, root, env); err != nil {
            panic(fmt.Errorf("launcher self-test nije uspeo: %w", err))
        }
        return
    }

    if err := run(py, root, "bootstrap.py", env); err != nil {
        panic(fmt.Errorf("bootstrap nije uspeo: %w", err))
    }
    env = append(env, "SUNO_AUTO_OPEN=1")
    if err := run(py, root, "server.py", env); err != nil {
        panic(fmt.Errorf("server nije uspeo: %w", err))
    }
}
