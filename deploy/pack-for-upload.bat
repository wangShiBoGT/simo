@echo off
REM Simo 打包脚本 - 生成可直接上传的文件夹
REM 双击运行即可

echo ========================================
echo   Simo 打包脚本
echo ========================================
echo.

cd /d "%~dp0.."

echo [1/3] 安装依赖...
call npm install

echo.
echo [2/3] 构建前端...
call npm run build

echo.
echo [3/3] 创建上传包...

REM 创建上传目录
if exist "upload" rmdir /s /q "upload"
mkdir upload

REM 复制必要文件
xcopy /e /i "dist" "upload\dist"
xcopy /e /i "server" "upload\server"
copy "package.json" "upload\"

echo.
echo ========================================
echo   打包完成！
echo ========================================
echo.
echo 上传 upload 文件夹到服务器
echo.
echo 服务器执行：
echo   cd simo
echo   npm install --production
echo   nohup node server/index.js ^> simo.log 2^>^&1 ^&
echo   npm install -g serve
echo   nohup serve -s dist -l 3000 ^> web.log 2^>^&1 ^&
echo.
echo 然后访问 http://服务器IP:3000
echo.
pause
