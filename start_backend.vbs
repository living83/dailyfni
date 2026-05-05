' start_backend.vbs — 카페 백엔드 서버를 창 없이 실행
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)

cmd = "cmd /c cd /d """ & base & """ && """ & base & "\.venv\Scripts\python.exe"" backend\main.py"
sh.Run cmd, 0, False  ' 0 = Hidden
