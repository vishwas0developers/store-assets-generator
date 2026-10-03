; Close any running copy first so reinstalling over an existing install overwrites cleanly.
!macro customInit
  nsExec::Exec 'taskkill /F /T /IM "Store Assets Generator.exe"'
  Sleep 800
!macroend
!macro customUnInit
  nsExec::Exec 'taskkill /F /T /IM "Store Assets Generator.exe"'
  Sleep 800
!macroend

; Enter / Esc / the window's X all raise .onUserAbort (owned by MUI2, which calls this hook).
; Never cancel silently: ask, defaulting to "continue". Abort here = keep installing.
  !define MUI_CUSTOMFUNCTION_ABORT confirmCancelInstall
  Function confirmCancelInstall
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Cancel Installation?$\r$\n$\r$\nThe installation is currently in progress. Cancelling now may leave some components incomplete.$\r$\n$\r$\nYes = Cancel Installation$\r$\nNo = Continue Installation" IDYES cancelNow
    Abort
    cancelNow:
  FunctionEnd
