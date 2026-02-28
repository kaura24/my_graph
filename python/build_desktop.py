import sys
import subprocess

def main():
    print("Building My Graph Desktop App with PyInstaller...")
    
    # 1. 빌드 전 필요한 패키지 확인
    try:
        import PyInstaller  # noqa
    except ImportError:
        print("Installing PyInstaller...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])
        
    # 2. PyInstaller 명령어 실행
    args = [
        "pyinstaller",
        "--noconfirm",
        "--windowed", # 콘솔 숨김
        "--name=MyGraph",
        "--add-data=../dist:dist", # Vite 빌드 결과물 포함 (실행 전 npm run build 필요)
        "desktop.py"
    ]
    
    print(f"Running: {' '.join(args)}")
    subprocess.check_call(args)
    print("Build complete! Check the python/dist/MyGraph directory.")

if __name__ == "__main__":
    main()
