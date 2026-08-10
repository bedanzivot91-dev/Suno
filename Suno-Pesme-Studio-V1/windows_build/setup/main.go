package main

import (
    "fmt"
    "io"
    "net/http"
    "os"
    "os/exec"
    "path/filepath"
    "strings"
    "syscall"
    "time"
    "unsafe"
)

const appName = "Suno Pesme Studio"
const appVersion = "1.0.0"
const webView2URL = "https://go.microsoft.com/fwlink/p/?LinkId=2124703"

var preservedNames = []string{"data", "Preuzete_pesme", "Izvoz", "OBRADJENO NA YOUTUBE", "Biblioteka_pesama", "Pronalazac_pesme"}

func box(text string, flags uintptr) uintptr {
    user32 := syscall.NewLazyDLL("user32.dll")
    proc := user32.NewProc("MessageBoxW")
    t, _ := syscall.UTF16PtrFromString(text)
    c, _ := syscall.UTF16PtrFromString(appName + " " + appVersion)
    r, _, _ := proc.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), flags)
    return r
}

func copyFile(src, dst string, mode os.FileMode) error {
    in, err := os.Open(src); if err != nil { return err }; defer in.Close()
    if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil { return err }
    out, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, mode); if err != nil { return err }
    _, cp := io.Copy(out, in); ce := out.Close(); if cp != nil { return cp }; return ce
}
func copyDir(src, dst string) error {
    return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
        if err != nil { return err }; rel, err := filepath.Rel(src, path); if err != nil { return err }
        target := filepath.Join(dst, rel); if info.IsDir() { return os.MkdirAll(target, info.Mode()) }
        return copyFile(path, target, info.Mode())
    })
}
func shortcut(link, target, work string) error {
    esc := func(s string) string { return strings.ReplaceAll(s, "'", "''") }
    script := fmt.Sprintf("$w=New-Object -ComObject WScript.Shell;$s=$w.CreateShortcut('%s');$s.TargetPath='%s';$s.WorkingDirectory='%s';$s.IconLocation='%s,0';$s.Save()", esc(link), esc(target), esc(work), esc(target))
    return exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script).Run()
}

func freeSpace(path string) (uint64, error) {
    k := syscall.NewLazyDLL("kernel32.dll"); p := k.NewProc("GetDiskFreeSpaceExW"); pp, e := syscall.UTF16PtrFromString(path); if e != nil { return 0,e }
    var avail,total,free uint64; r,_,ce := p.Call(uintptr(unsafe.Pointer(pp)), uintptr(unsafe.Pointer(&avail)), uintptr(unsafe.Pointer(&total)), uintptr(unsafe.Pointer(&free))); if r==0 { return 0,ce }; return avail,nil
}
func ensureSpace(path string) error { f,e:=freeSpace(path); if e!=nil{return e}; if f < 12*1024*1024*1024 { return fmt.Errorf("potrebno je najmanje 12 GB slobodnog prostora; dostupno %.2f GB", float64(f)/(1024*1024*1024)) }; return nil }

func hasWebView2() bool {
    keys := []string{`HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`, `HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`, `HKCU\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`}
    for _,k:=range keys { out,e:=exec.Command("reg.exe","query",k,"/v","pv").CombinedOutput(); if e==nil && strings.Contains(strings.ToLower(string(out)),"pv") && !strings.Contains(string(out),"0.0.0.0") { return true } }; return false
}
func ensureWebView2() error {
    if hasWebView2(){return nil}; dst:=filepath.Join(os.TempDir(),"MicrosoftEdgeWebview2Setup.exe")
    cl:=&http.Client{Timeout:15*time.Minute}; resp,e:=cl.Get(webView2URL); if e!=nil{return e}; defer resp.Body.Close(); if resp.StatusCode<200||resp.StatusCode>=300{return fmt.Errorf("WebView2 HTTP %s",resp.Status)}
    f,e:=os.Create(dst); if e!=nil{return e}; _,e=io.Copy(f,io.LimitReader(resp.Body,64*1024*1024+1)); ce:=f.Close(); if e!=nil{return e}; if ce!=nil{return ce}; defer os.Remove(dst)
    esc:=strings.ReplaceAll(dst,"'","''"); verify:=fmt.Sprintf("$s=Get-AuthenticodeSignature -LiteralPath '%s';if($s.Status -ne 'Valid' -or -not $s.SignerCertificate.Subject.Contains('Microsoft')){exit 21}",esc)
    if e:=exec.Command("powershell.exe","-NoProfile","-ExecutionPolicy","Bypass","-Command",verify).Run();e!=nil{return fmt.Errorf("WebView2 Microsoft signature verification failed: %w",e)}
    out,e:=exec.Command(dst,"/silent","/install").CombinedOutput(); if e!=nil{return fmt.Errorf("WebView2 install failed: %v (%s)",e,strings.TrimSpace(string(out)))}
    for i:=0;i<15;i++{if hasWebView2(){return nil};time.Sleep(time.Second)};return fmt.Errorf("WebView2 runtime not detected after install")
}

func runPanako(target string) (int,string) {
    ps:=filepath.Join(target,"plugins","INSTALIRAJ_PANAKO_OBAVEZNO.ps1"); if _,e:=os.Stat(ps);e!=nil{return 1,"Panako installer nije pronađen: "+e.Error()}
    cmd:=exec.Command("powershell.exe","-NoProfile","-ExecutionPolicy","Bypass","-File",ps,"-NonInteractive"); out,e:=cmd.CombinedOutput(); text:=string(out)
    if e==nil{return 0,text}; if ee,ok:=e.(*exec.ExitError);ok{return ee.ExitCode(),text};return 1,text+"\n"+e.Error()
}
func rollback(target,backup string){_ = os.RemoveAll(target); if _,e:=os.Stat(backup);e==nil{_ = os.Rename(backup,target)}}

func main(){
    exe,e:=os.Executable(); if e!=nil{box(e.Error(),0x10);return}; sourceRoot:=filepath.Dir(exe); src:=filepath.Join(sourceRoot,"Program"); if st,e:=os.Stat(src);e!=nil||!st.IsDir(){box("Folder Program nije pronađen pored installera.",0x10);return}
    local:=os.Getenv("LOCALAPPDATA"); if local==""{box("LOCALAPPDATA nije dostupan.",0x10);return}; if e:=ensureSpace(local);e!=nil{box("Instalacija zaustavljena: "+e.Error(),0x10);return}; if e:=ensureWebView2();e!=nil{box("WebView2 nije spreman: "+e.Error(),0x10);return}
    target:=filepath.Join(local,"Programs",appName); temp:=target+".new"; backup:=target+".old"
    _=exec.Command("taskkill.exe","/IM","Suno Pesme Studio.exe","/T","/F").Run(); _=os.RemoveAll(temp); _=os.RemoveAll(backup)
    if e:=copyDir(src,temp);e!=nil{box("Kopiranje programa nije uspelo: "+e.Error(),0x10);return}
    if _,e:=os.Stat(target);e==nil { for _,name:=range preservedNames { old:=filepath.Join(target,name); if st,er:=os.Stat(old);er==nil { dst:=filepath.Join(temp,name); _=os.RemoveAll(dst); if st.IsDir(){if er=copyDir(old,dst);er!=nil{box("Čuvanje korisničkih podataka nije uspelo: "+er.Error(),0x10);return}} else {if er=copyFile(old,dst,st.Mode());er!=nil{box("Čuvanje korisničkih podataka nije uspelo: "+er.Error(),0x10);return}} } }; if e:=os.Rename(target,backup);e!=nil{box("Stara instalacija ne može da se sačuva: "+e.Error(),0x10);return} }
    if e:=os.Rename(temp,target);e!=nil{_ = os.Rename(backup,target);box("Aktiviranje instalacije nije uspelo: "+e.Error(),0x10);return}
    launcher:=filepath.Join(target,"Suno Pesme Studio.exe"); if _,e:=os.Stat(launcher);e!=nil{rollback(target,backup);box("Glavni launcher nije pronađen posle instalacije.",0x10);return}
    code,out:=runPanako(target); if code==3010 { box("Windows/WSL zahteva restart. Program je kopiran, ali instalacija Panako/Olaf još NIJE završena. Restartuj Windows i ponovo pokreni isti INSTALIRAJ_PROGRAM.exe.",0x30); os.Exit(3010) }
    if code!=0 { rollback(target,backup); if len(out)>1800{out=out[len(out)-1800:]};box("Panako/Olaf instalacija ili E2E provera nije prošla. Instalacija programa je vraćena na prethodno stanje.\n\n"+out,0x10);return }
    desktop:=filepath.Join(os.Getenv("USERPROFILE"),"Desktop",appName+".lnk"); start:=filepath.Join(os.Getenv("APPDATA"),"Microsoft","Windows","Start Menu","Programs",appName+".lnk"); _=shortcut(desktop,launcher,target); _=shortcut(start,launcher,target)
    un:=filepath.Join(target,"Deinstaliraj Suno Pesme Studio.exe"); if _,e:=os.Stat(un);e==nil { key:=`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\SunoPesmeStudio`; _=exec.Command("reg.exe","add",key,"/v","DisplayName","/t","REG_SZ","/d",appName,"/f").Run(); _=exec.Command("reg.exe","add",key,"/v","DisplayVersion","/t","REG_SZ","/d",appVersion,"/f").Run(); _=exec.Command("reg.exe","add",key,"/v","UninstallString","/t","REG_SZ","/d",`"`+un+`"`,`/f`).Run() }
    _=os.RemoveAll(backup); box("Suno Pesme Studio je instaliran. Panako + Olaf E2E provera je prošla. Pokrećem program.",0x40); _=exec.Command(launcher).Start()
}
