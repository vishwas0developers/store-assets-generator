; Close any running copy first so reinstalling over an existing install overwrites cleanly.
!macro customInit
  nsExec::Exec 'taskkill /F /T /IM "Store Assets Generator.exe"'
  Sleep 800
!macroend
!macro customUnInit
  nsExec::Exec 'taskkill /F /T /IM "Store Assets Generator.exe"'
  Sleep 800
!macroend
