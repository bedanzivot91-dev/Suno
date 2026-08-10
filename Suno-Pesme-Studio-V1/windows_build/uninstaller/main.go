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
const appVersion = "1.0.0"
var preservedNames=[]string{"data","Preuzete_pesme","Izvoz","OBRADJENO NA YOUTUBE","Biblioteka_pesama","Pronalazac_pesme"}

func ciMode() bool { return os.Getenv("SPS_UNINSTALL_TEST_MODE") == "1" && os.Getenv("GITHUB_ACTIONS") == "true" }
func box(text string, flags uintptr) uintptr {
    if ciMode() { fmt.Println(text); return 1 }
    u:=syscall.NewLazyDLL("user32.dll"); p:=u.NewProc("MessageBoxW"); t,_:=syscall.UTF16PtrFromString(text); c,_:=syscall.UTF16PtrFromString(appName+" "+appVersion); r,_,_:=p.Call(0,uintptr(unsafe.Pointer(t)),uintptr(unsafe.Pointer(c)),flags); return r
}
func copyFile(src,dst string,mode os.FileMode)error{in,e:=os.Open(src);if e!=nil{return e};defer in.Close();if e=os.MkdirAll(filepath.Dir(dst),0755);e!=nil{return e};out,e:=os.OpenFile(dst,os.O_CREATE|os.O_TRUNC|os.O_WRONLY,mode);if e!=nil{return e};_,ce:=io.Copy(out,in);x:=out.Close();if ce!=nil{return ce};return x}
func copyDir(src,dst string)error{return filepath.Walk(src,func(path string,info os.FileInfo,e error)error{if e!=nil{return e};rel,e:=filepath.Rel(src,path);if e!=nil{return e};to:=filepath.Join(dst,rel);if info.IsDir(){return os.MkdirAll(to,info.Mode())};return copyFile(path,to,info.Mode())})}

func main(){
    keep:=true
    if !ciMode() {
        r:=box("Deinstalirati Suno Pesme Studio?\n\nDA = sačuvaj biblioteku i korisničke podatke.\nNE = obriši i korisničke podatke.\nOTKAŽI = ništa ne menjaj.",0x23)
        if r==2{return}; if r==7{keep=false}
    } else { keep=false }
    local:=os.Getenv("LOCALAPPDATA"); if local==""{box("LOCALAPPDATA nije dostupan.",0x10);return}; target:=filepath.Join(local,"Programs",appName)
    _=exec.Command("taskkill.exe","/IM","Suno Pesme Studio.exe","/T","/F").Run()
    if keep { saved:=filepath.Join(local,appName,"UserData"); stage:=saved+".new"; backup:=saved+".old"; _=os.RemoveAll(stage);_=os.RemoveAll(backup); if e:=os.MkdirAll(stage,0755);e!=nil{box(e.Error(),0x10);return}; if st,e:=os.Stat(saved);e==nil&&st.IsDir(){if e=copyDir(saved,stage);e!=nil{box("Ne mogu da pripremim postojeće sačuvane podatke: "+e.Error(),0x10);return}}; for _,n:=range preservedNames{src:=filepath.Join(target,n);st,e:=os.Stat(src);if e!=nil{continue};dst:=filepath.Join(stage,n);_=os.RemoveAll(dst);if st.IsDir(){e=copyDir(src,dst)}else{e=copyFile(src,dst,st.Mode())};if e!=nil{box("Ne mogu da sačuvam "+n+": "+e.Error(),0x10);return}}; if _,e:=os.Stat(saved);e==nil{if e=os.Rename(saved,backup);e!=nil{box(e.Error(),0x10);return}}; if e:=os.Rename(stage,saved);e!=nil{_=os.Rename(backup,saved);box(e.Error(),0x10);return};_=os.RemoveAll(backup) } else { _=os.RemoveAll(filepath.Join(local,appName)) }
    _=os.Remove(filepath.Join(os.Getenv("USERPROFILE"),"Desktop",appName+".lnk")); _=os.Remove(filepath.Join(os.Getenv("APPDATA"),"Microsoft","Windows","Start Menu","Programs",appName+".lnk")); _=exec.Command("reg.exe","delete",`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\SunoPesmeStudio`,"/f").Run()
    if ciMode() {
        if e:=os.RemoveAll(target);e!=nil{fmt.Println("SPS_UNINSTALL_TEST_FAIL:",e);os.Exit(1)}
        if _,e:=os.Stat(target);!os.IsNotExist(e){fmt.Println("SPS_UNINSTALL_TEST_FAIL: target still exists");os.Exit(1)}
        fmt.Println("SPS_UNINSTALL_TEST_OK")
        return
    }
    esc:=strings.ReplaceAll(target,"%","%%"); cmd:=exec.Command("cmd.exe","/D","/S","/C",fmt.Sprintf(`ping 127.0.0.1 -n 3 > nul & rmdir /S /Q "%s"`,esc)); cmd.SysProcAttr=&syscall.SysProcAttr{HideWindow:true}; if e:=cmd.Start();e!=nil{box("Ne mogu da pokrenem završno uklanjanje: "+e.Error(),0x10);return}
    msg:="Program je deinstaliran.";if keep{msg+="\n\nBiblioteka i korisnički podaci su sačuvani za sledeću instalaciju."};box(msg,0x40)
}
