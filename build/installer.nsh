; Keep application data next to the EXE without letting upgrades erase it.
!include LogicLib.nsh
!include nsDialogs.nsh
!include MUI2.nsh
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!ifndef BUILD_UNINSTALLER
  !macro customPageAfterChangeDir
    Page custom EasyMusicStoragePage EasyMusicStorageLeave
  !macroend

  Function EasyMusicStoragePage
    !insertmacro MUI_HEADER_TEXT "程序与数据目录" "登录状态、设置和缓存都保存在安装目录旁的 data 文件夹。"
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 42u "安装位置：$INSTDIR$\r$\n$\r$\n数据位置：$INSTDIR\data"
    Pop $0
    ${NSD_CreateLabel} 0 55u 100% 55u "建议选择当前用户可写的目录，例如 D:\Apps\EasyMusic。请勿选择 Program Files 等受保护的目录。$\r$\n$\r$\n覆盖安装会保留已有个人数据；卸载时可选择是否删除个人数据。"
    Pop $0
    nsDialogs::Show
  FunctionEnd

  Function EasyMusicStorageLeave
    ClearErrors
    CreateDirectory "$INSTDIR\data"
    GetTempFileName $0 "$INSTDIR\data"
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONEXCLAMATION "无法写入这个目录。请点击上一步，选择当前用户可写的安装位置。"
      Abort
    ${EndIf}
    Delete "$0"
  FunctionEnd
!else
  Var EasyMusicInstallRootVerified

  ; Remove only the supplied tree. Directory links/junctions themselves are removed
  ; without traversing their targets. No recursive RMDir is used.
  Function un.EasyMusicRemoveTree
    Exch $0
    Push $1
    Push $2
    Push $3
    System::Call 'kernel32::GetFileAttributesW(w r0) i .r3'
    IntCmp $3 -1 em_tree_done
    IntOp $3 $3 & 0x400
    ${If} $3 != 0
      RMDir "$0"
      Goto em_tree_done
    ${EndIf}
    FindFirst $1 $2 "$0\*"
    em_tree_loop:
      StrCmp $2 "" em_tree_finish
      StrCmp $2 "." em_tree_next
      StrCmp $2 ".." em_tree_next
      System::Call 'kernel32::GetFileAttributesW(w "$0\$2") i .r3'
      IntOp $3 $3 & 0x10
      ${If} $3 != 0
        Push "$0\$2"
        Call un.EasyMusicRemoveTree
      ${Else}
        Delete "$0\$2"
      ${EndIf}
    em_tree_next:
      FindNext $1 $2
      Goto em_tree_loop
    em_tree_finish:
      FindClose $1
      RMDir "$0"
    em_tree_done:
    Pop $3
    Pop $2
    Pop $1
    Pop $0
  FunctionEnd

  !macro customRemoveFiles
    ; Refuse a drive root, relative/redirected root or a directory without our app.
    GetFullPathName $0 "$INSTDIR"
    GetFullPathName $1 "$INSTDIR\.."
    ${If} $0 == $1
      Abort "安装目录无效，已停止卸载。"
    ${EndIf}
    System::Call 'kernel32::GetFileAttributesW(w r0) i .r2'
    IntOp $2 $2 & 0x400
    ${If} $2 != 0
      Abort "安装目录是目录链接，请先检查实际位置。"
    ${EndIf}
    ${IfNot} ${FileExists} "$INSTDIR\EasyMusic.exe"
      Abort "找不到 EasyMusic.exe，已停止卸载以保护其他文件。"
    ${EndIf}
    ${IfNot} ${FileExists} "$INSTDIR\resources\app.asar"
      Abort "找不到应用资源，已停止卸载以保护其他文件。"
    ${EndIf}
    StrCpy $EasyMusicInstallRootVerified "1"
    SetOutPath $TEMP
    !include "${BUILD_RESOURCES_DIR}\.installer-files.nsh"
    Delete "$INSTDIR\${UNINSTALL_FILENAME}"
    Delete "$INSTDIR\uninstallerIcon.ico"
    RMDir "$INSTDIR"
  !macroend

  !macro customUnInstallSection
    Section /o "un.删除个人数据（登录状态、设置、播放记录和缓存）" em_delete_data
      ${IfNot} ${isUpdated}
      ${AndIf} $EasyMusicInstallRootVerified == "1"
        Push "$INSTDIR\data"
        Call un.EasyMusicRemoveTree
        RMDir "$INSTDIR"
      ${EndIf}
    SectionEnd
  !macroend
!endif
