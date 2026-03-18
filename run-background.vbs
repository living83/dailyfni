' DailyFNI - Background Server Launcher
' This VBS script launches both servers as hidden processes
' so they survive even if the terminal window is closed.

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get script directory
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
If Right(scriptDir, 1) <> "\" Then scriptDir = scriptDir & "\"

' Ensure logs directory exists
logsDir = scriptDir & "logs"
If Not fso.FolderExists(logsDir) Then fso.CreateFolder(logsDir)

' Blog Generator (port 8000)
blogPython = scriptDir & "blog-generator\.venv\Scripts\pythonw.exe"
blogDir = scriptDir & "blog-generator\backend"
blogLog = logsDir & "\blog.log"

' Cafe Macro (port 8001)
cafePython = scriptDir & "naver-cafe-macro\.venv\Scripts\pythonw.exe"
cafeDir = scriptDir & "naver-cafe-macro\backend"
cafeLog = logsDir & "\cafe.log"

' Launch Blog Generator in background
' pythonw.exe runs without a console window
' Output is redirected to log file
blogCmd = "cmd /c cd /d """ & blogDir & """ && """ & blogPython & """ main.py > """ & blogLog & """ 2>&1"
WshShell.Run blogCmd, 0, False

' Launch Cafe Macro in background
cafeCmd = "cmd /c cd /d """ & cafeDir & """ && """ & cafePython & """ main.py > """ & cafeLog & """ 2>&1"
WshShell.Run cafeCmd, 0, False
