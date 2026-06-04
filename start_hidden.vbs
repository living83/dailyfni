Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)

' Node.js 백엔드
sh.Run "cmd /c cd /d """ & base & """ && node src/index.js", 0, False

' Python FastAPI (venv 활성화 후 실행)
sh.Run "cmd /c cd /d """ & base & "\blog-generator"" && call venv\Scripts\activate.bat && cd backend && uvicorn main:app --host 0.0.0.0 --port 8000", 0, False

' 프론트엔드
sh.Run "cmd /c cd /d """ & base & "\frontend"" && npx vite --host 0.0.0.0 --port 5173", 0, False
