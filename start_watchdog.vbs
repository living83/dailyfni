' watchdog_start.vbs — Watchdog를 숨김 창으로 백그라운드에서 실행
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = "C:\Users\BH04\.cache\dailyfni"

cmd = "cmd /c cd /d """ & base & """ && """ & base & "\naver_blog_auto\venv\Scripts\python.exe"" watchdog.py"
sh.Run cmd, 0, False  ' 0 = Hidden
