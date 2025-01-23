import os
import sys
import platform
import subprocess

def check_dependency(name):
    """Check if dependency is installed"""
    try:
        if platform.system() == "Darwin":  # macOS
            result = subprocess.run(['brew', 'list', name], capture_output=True, text=True)
            return result.returncode == 0
        elif platform.system() == "Windows":
            # Windows check logic
            pass
        return False
    except:
        return False

def install_dependency(name):
    """Install dependency"""
    try:
        if platform.system() == "Darwin":  # macOS
            subprocess.run(['brew', 'install', name], check=True)
            return True
        elif platform.system() == "Windows":
            # Windows installation logic
            pass
        return False
    except:
        return False

def main():
    print("Checking system dependencies...")
    
    # Required dependencies
    dependencies = ['libreoffice', 'graphicsmagick', 'poppler']
    
    # Check and install dependencies
    for dep in dependencies:
        if not check_dependency(dep):
            print(f"Installing {dep}...")
            if install_dependency(dep):
                print(f"{dep} installed successfully")
            else:
                print(f"{dep} installation failed, please install manually")
        else:
            print(f"{dep} is already installed")
    
    # Install Python dependencies
    print("\nInstalling Python dependencies...")
    subprocess.run([sys.executable, '-m', 'pip', 'install', '-r', 'requirements.txt'])
    
    print("\nInstallation complete!")

if __name__ == "__main__":
    main() 