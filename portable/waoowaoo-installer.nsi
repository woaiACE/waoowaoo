; waoowaoo-installer.nsi — NSIS 安装脚本
; 由 build-exe.ps1 通过 makensis 编译为单文件 .exe 安装程序
;
; 编译方式（由 build-exe.ps1 自动调用）：
;   makensis /DVERSION=0.3.0 /DDIST_WIN=dist-win /DOUTPUT_DIR=dist portable\waoowaoo-installer.nsi
;
; 前置条件：
;   - ${DIST_WIN}\ 目录已由 build-exe.ps1 完整准备（含 app/ node/ portable_* resources/ *.bat *.vbs 等）
;   - ${DIST_WIN}\resources\logo.ico 存在
;
; 功能特性（含全部修正点）：
;   ✅ 修正1: 数据目录统一（data\mysql data\minio data\redis，portable_* 为纯二进制）
;   ✅ 修正2: 升级前自动调用 uninstall-helper.bat 停止旧服务，释放文件锁
;   ✅ 修正3: 升级时自动备份 app\.secrets（JWT/加密密钥），安装后恢复
;   ✅ 修正4: 所有服务绑定 127.0.0.1，无需防火墙规则，不触发 UAC 弹窗

Unicode True

; LZMA 固实压缩（最高压缩率，适合大体积安装包）
SetCompressor /SOLID lzma
SetCompressorDictSize 32

; ── 编译时变量（由 makensis /D 传入，此处设默认值） ─────────────────────────
!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef DIST_WIN
  !define DIST_WIN "dist-win"
!endif
!ifndef OUTPUT_DIR
  !define OUTPUT_DIR "dist"
!endif

; ── 应用元数据 ──────────────────────────────────────────────────────────────
!define APP_NAME       "waoowaoo AI Studio"
!define APP_VERSION    "${VERSION}"
!define APP_PUBLISHER  "waoowaoo"
!define APP_URL        "https://github.com/woaiACE/waoowaoo"
!define APP_ICON       "${DIST_WIN}\resources\logo.ico"
!define REG_KEY        "Software\waoowaoo"
!define UNINSTALL_KEY  "Software\Microsoft\Windows\CurrentVersion\Uninstall\waoowaoo"

; ── MUI2 现代化安装界面 ──────────────────────────────────────────────────────
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

; MUI 图标
!ifndef DISABLE_CUSTOM_ICON
  !define MUI_ICON   "${APP_ICON}"
  !define MUI_UNICON "${APP_ICON}"
!endif

; 完成页：提供"立即启动"快捷入口（通过 wscript.exe 无黑窗启动）
!define MUI_FINISHPAGE_RUN            "$INSTDIR\start-silent.vbs"
!define MUI_FINISHPAGE_RUN_TEXT       "安装完成后立即启动 ${APP_NAME}"
!define MUI_FINISHPAGE_LINK           "访问项目主页"
!define MUI_FINISHPAGE_LINK_LOCATION  "${APP_URL}"

; ── 安装向导页 ──────────────────────────────────────────────────────────────
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; ── 卸载向导页 ──────────────────────────────────────────────────────────────
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; ── 语言（简体中文优先，备选英文）──────────────────────────────────────────
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

; ── 基本属性 ────────────────────────────────────────────────────────────────
Name             "${APP_NAME} v${APP_VERSION}"
OutFile          "${OUTPUT_DIR}\waoowaoo-setup-v${APP_VERSION}-windows.exe"
InstallDir       "$PROGRAMFILES64\waoowaoo"
InstallDirRegKey HKLM "${REG_KEY}" "Install_Dir"

; 需要管理员权限（写入 Program Files + HKLM 注册表）
; 注：无需防火墙规则——所有服务严格绑定 127.0.0.1，不会触发 Windows 防火墙弹窗
RequestExecutionLevel admin

; ── 全局变量 ────────────────────────────────────────────────────────────────
Var IS_UPGRADE       ; 是否为升级覆盖安装（"1" 表示是）
Var SECRETS_BACKUP   ; 升级时 app\.secrets 备份的临时文件路径

; ── 安装初始化：升级检测 + 停止旧服务 + 备份密钥 ────────────────────────────
Function .onInit
  StrCpy $IS_UPGRADE "0"
  StrCpy $SECRETS_BACKUP ""

  ; 检测是否已安装（通过注册表读取上次安装路径）
  ReadRegStr $0 HKLM "${REG_KEY}" "Install_Dir"
  ${If} $0 != ""
    StrCpy $IS_UPGRADE "1"
    StrCpy $INSTDIR $0  ; 沿用旧安装路径作为默认目录

    ; [修正3] 备份 app\.secrets（JWT 密钥 + 加密 API Key）
    ; 升级后必须恢复，否则用户登录状态失效、已存储 API Key 无法解密
    ${If} ${FileExists} "$INSTDIR\app\.secrets"
      GetTempFileName $SECRETS_BACKUP
      CopyFiles /SILENT "$INSTDIR\app\.secrets" $SECRETS_BACKUP
    ${EndIf}

    ; 询问用户确认升级
    MessageBox MB_OKCANCEL|MB_ICONQUESTION \
      "检测到 ${APP_NAME} 已安装在：$\n$INSTDIR$\n$\n点击「确定」升级（数据库和媒体数据保留）。$\n点击「取消」退出。" \
      IDOK do_upgrade
    ; 用户取消：清理备份文件后中止
    ${If} $SECRETS_BACKUP != ""
      Delete $SECRETS_BACKUP
    ${EndIf}
    Abort

    do_upgrade:
    ; [修正2] 升级前停止所有正在运行的旧服务，释放文件锁
    ; 防止 NSIS 覆盖 node.exe / mysqld.exe 等正在使用的文件时报"文件被占用"错误
    ${If} ${FileExists} "$INSTDIR\uninstall-helper.bat"
      ExecWait '"$INSTDIR\uninstall-helper.bat"'
      Sleep 2000
    ${EndIf}
  ${EndIf}
FunctionEnd

; ── 安装失败时清理 secrets 备份临时文件 ─────────────────────────────────────
Function .onInstFailed
  ${If} $SECRETS_BACKUP != ""
  ${AndIf} ${FileExists} "$SECRETS_BACKUP"
    Delete "$SECRETS_BACKUP"
    StrCpy $SECRETS_BACKUP ""
  ${EndIf}
FunctionEnd

; ── 主安装段 ────────────────────────────────────────────────────────────────
Section "主程序 (必需)" SecMain
  SectionIn RO  ; 此段不可取消选择

  SetOutPath "$INSTDIR"

  ; 解压所有文件（NSIS 递归创建子目录，维持 dist-win\ 下的相对路径结构）
  ; portable_* 目录为纯只读二进制，不含用户数据（数据统一在 $LOCALAPPDATA\waoowaoo\ 下）
  File /r "${DIST_WIN}\*"

  ; 校验关键文件是否存在，防止安装包不完整时给出"看似成功"的残缺安装
  ${IfNot} ${FileExists} "$INSTDIR\app\server\server.js"
  ${OrIfNot} ${FileExists} "$INSTDIR\node\node.exe"
  ${OrIfNot} ${FileExists} "$INSTDIR\portable_db\bin\mysqld.exe"
    MessageBox MB_ICONSTOP "安装失败：安装包不完整或损坏（缺少关键运行文件）。$\n请重新下载或联系维护者。"
    Abort
  ${EndIf}

  ; 确保运行时目录存在（用户数据统一写入 $LOCALAPPDATA\waoowaoo，不污染安装目录）
  ; start.bat 也会在启动时创建这些目录，此处预创建以保证卸载脚本可定位 PID 文件
  CreateDirectory "$LOCALAPPDATA\waoowaoo"
  CreateDirectory "$LOCALAPPDATA\waoowaoo\data"
  CreateDirectory "$LOCALAPPDATA\waoowaoo\data\mysql"
  CreateDirectory "$LOCALAPPDATA\waoowaoo\data\minio"
  CreateDirectory "$LOCALAPPDATA\waoowaoo\data\redis"
  CreateDirectory "$LOCALAPPDATA\waoowaoo\logs"
  CreateDirectory "$LOCALAPPDATA\waoowaoo\pids"

  ; [修正3] 升级：恢复备份的 app\.secrets（JWT 密钥 + 加密 API Key）
  ${If} $IS_UPGRADE == "1"
  ${AndIf} $SECRETS_BACKUP != ""
  ${AndIf} ${FileExists} "$SECRETS_BACKUP"
    CreateDirectory "$INSTDIR\app"
    ClearErrors
    CopyFiles /SILENT "$SECRETS_BACKUP" "$INSTDIR\app\.secrets"
    ${If} ${Errors}
      MessageBox MB_ICONSTOP "无法从临时备份恢复 app\.secrets，安装已中止。$\n请重试安装或联系支持。"
      Abort
    ${EndIf}
    Delete "$SECRETS_BACKUP"
    StrCpy $SECRETS_BACKUP ""
  ${EndIf}

  ; ── 桌面快捷方式 ──────────────────────────────────────────────────────────
  ; 目标：wscript.exe（以 windowStyle=0 隐藏窗口模式运行 start-silent.vbs）
  CreateShortcut \
    "$DESKTOP\waoowaoo AI Studio.lnk" \
    "$SYSDIR\wscript.exe" \
    '"$INSTDIR\start-silent.vbs"' \
    "$INSTDIR\resources\logo.ico" 0

  ; ── 创建卸载程序 ──────────────────────────────────────────────────────────
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; ── 注册表写入（Programs & Features 控制面板显示）─────────────────────────
  WriteRegStr   HKLM "${REG_KEY}"       "Install_Dir"     "$INSTDIR"
  WriteRegStr   HKLM "${REG_KEY}"       "Version"         "${APP_VERSION}"
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "DisplayName"     "${APP_NAME}"
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "DisplayVersion"  "${APP_VERSION}"
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "Publisher"       "${APP_PUBLISHER}"
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "URLInfoAbout"    "${APP_URL}"
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "DisplayIcon"     "$INSTDIR\resources\logo.ico"
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoModify"        1
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoRepair"        1

  ; 估算安装大小（KB），供控制面板显示
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "EstimatedSize" "$0"

SectionEnd

; ── 卸载段 ──────────────────────────────────────────────────────────────────
Section "Uninstall"

  ; [修正2] 先停止所有服务（释放文件锁），再删除文件
  ${If} ${FileExists} "$INSTDIR\uninstall-helper.bat"
    ExecWait '"$INSTDIR\uninstall-helper.bat"'
    Sleep 3000
  ${EndIf}

  ; [修正1] 询问是否删除用户数据（数据统一在 $LOCALAPPDATA\waoowaoo\ 下）
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "是否同时删除数据库和媒体数据？$\n$\n• 选「是」：彻底清除（$LOCALAPPDATA\waoowaoo\data\ 全部删除）$\n• 选「否」：仅删除应用程序文件，保留数据库记录和上传文件" \
    IDNO skip_data_delete
  RMDir /r "$LOCALAPPDATA\waoowaoo\data"
  RMDir /r "$INSTDIR\data"  ; 兼容旧版安装路径
  skip_data_delete:

  ; 删除应用程序文件（portable_* 均为纯二进制，可直接整目录删除）
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\node"
  RMDir /r "$INSTDIR\portable_db"
  RMDir /r "$INSTDIR\portable_redis"
  RMDir /r "$INSTDIR\portable_minio"
  RMDir /r "$LOCALAPPDATA\waoowaoo\logs"
  RMDir /r "$LOCALAPPDATA\waoowaoo\pids"
  RMDir /r "$INSTDIR\logs"  ; 兼容旧版安装路径
  RMDir /r "$INSTDIR\pids"  ; 兼容旧版安装路径
  RMDir /r "$INSTDIR\resources"

  Delete "$INSTDIR\*.bat"
  Delete "$INSTDIR\*.vbs"
  Delete "$INSTDIR\*.ps1"
  Delete "$INSTDIR\*.txt"
  Delete "$INSTDIR\*.md"
  Delete "$INSTDIR\*.json"
  Delete "$INSTDIR\Uninstall.exe"

  ; 若安装根目录已为空（data/ 也被删除），则删除目录本身
  RMDir "$INSTDIR"

  ; 删除桌面快捷方式
  Delete "$DESKTOP\waoowaoo AI Studio.lnk"

  ; 清理注册表
  DeleteRegKey HKLM "${UNINSTALL_KEY}"
  DeleteRegKey HKLM "${REG_KEY}"

SectionEnd
