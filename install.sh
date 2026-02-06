#!/bin/bash
#
# Jack The Butler - Installer Script
# Usage: curl -fsSL https://raw.githubusercontent.com/JackTheButler/JackTheButler/main/install.sh | bash
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Config
IMAGE_NAME="ghcr.io/jackthebutler/jackthebutler"
CONTAINER_NAME="jack"
PORT=3000
VOLUME_NAME="jack-data"

echo ""
echo -e "${BOLD}      ██╗ █████╗  ██████╗██╗  ██╗    ${NC}"
echo -e "${BOLD}      ██║██╔══██╗██╔════╝██║ ██╔╝    ${NC}"
echo -e "${BOLD}      ██║███████║██║     █████╔╝     ${NC}"
echo -e "${BOLD} ██   ██║██╔══██║██║     ██╔═██╗     ${NC}"
echo -e "${BOLD} ╚█████╔╝██║  ██║╚██████╗██║  ██╗    ${NC}"
echo -e "${BOLD}  ╚════╝ ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝    ${NC}"
echo ""
echo -e "${BOLD} ████████╗██╗  ██╗███████╗${NC}"
echo -e "${BOLD} ╚══██╔══╝██║  ██║██╔════╝${NC}"
echo -e "${BOLD}    ██║   ███████║█████╗  ${NC}"
echo -e "${BOLD}    ██║   ██╔══██║██╔══╝  ${NC}"
echo -e "${BOLD}    ██║   ██║  ██║███████╗${NC}"
echo -e "${BOLD}    ╚═╝   ╚═╝  ╚═╝╚══════╝${NC}"
echo ""
echo -e "${BOLD} ██████╗ ██╗   ██╗████████╗██╗     ███████╗██████╗ ${NC}"
echo -e "${BOLD} ██╔══██╗██║   ██║╚══██╔══╝██║     ██╔════╝██╔══██╗${NC}"
echo -e "${BOLD} ██████╔╝██║   ██║   ██║   ██║     █████╗  ██████╔╝${NC}"
echo -e "${BOLD} ██╔══██╗██║   ██║   ██║   ██║     ██╔══╝  ██╔══██╗${NC}"
echo -e "${BOLD} ██████╔╝╚██████╔╝   ██║   ███████╗███████╗██║  ██║${NC}"
echo -e "${BOLD} ╚═════╝  ╚═════╝    ╚═╝   ╚══════╝╚══════╝╚═╝  ╚═╝${NC}"
echo ""
echo "AI Hospitality Assistant"
echo "========================"
echo ""

# Check for Docker
check_docker() {
    if command -v docker &> /dev/null; then
        echo -e "${GREEN}✓${NC} Docker is installed"
        return 0
    else
        echo -e "${RED}✗${NC} Docker is not installed"
        return 1
    fi
}

# Install Docker based on OS
install_docker() {
    echo ""
    echo -e "${YELLOW}Docker is required to run Jack The Butler.${NC}"
    echo ""

    case "$(uname -s)" in
        Darwin)
            echo "Please install Docker Desktop for Mac:"
            echo -e "${BLUE}https://docs.docker.com/desktop/install/mac-install/${NC}"
            echo ""
            echo "After installing, run this script again."
            ;;
        Linux)
            echo "Install Docker with:"
            echo -e "${BLUE}curl -fsSL https://get.docker.com | sh${NC}"
            echo ""
            read -p "Install Docker now? (y/n) " -n 1 -r
            echo ""
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                curl -fsSL https://get.docker.com | sh
                sudo usermod -aG docker $USER
                echo ""
                echo -e "${YELLOW}Please log out and back in, then run this script again.${NC}"
                exit 0
            fi
            ;;
        MINGW*|CYGWIN*|MSYS*)
            echo "Please install Docker Desktop for Windows:"
            echo -e "${BLUE}https://docs.docker.com/desktop/install/windows-install/${NC}"
            echo ""
            echo "After installing, run this script again."
            ;;
        *)
            echo "Unknown OS. Please install Docker manually:"
            echo -e "${BLUE}https://docs.docker.com/get-docker/${NC}"
            ;;
    esac
    exit 1
}

# Check if Docker daemon is running
check_docker_running() {
    if docker info &> /dev/null; then
        echo -e "${GREEN}✓${NC} Docker is running"
        return 0
    else
        echo -e "${RED}✗${NC} Docker is not running"
        echo ""
        echo "Please start Docker and run this script again."
        exit 1
    fi
}

# Stop existing container if running
stop_existing() {
    if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
        echo -e "${YELLOW}→${NC} Stopping existing Jack container..."
        docker stop "$CONTAINER_NAME" > /dev/null
        docker rm "$CONTAINER_NAME" > /dev/null
    elif docker ps -aq -f name="$CONTAINER_NAME" | grep -q .; then
        echo -e "${YELLOW}→${NC} Removing existing Jack container..."
        docker rm "$CONTAINER_NAME" > /dev/null
    fi
}

# Run Jack
run_jack() {
    echo -e "${YELLOW}→${NC} Starting Jack The Butler..."
    echo ""

    docker run -d \
        --name "$CONTAINER_NAME" \
        --restart unless-stopped \
        -p "$PORT:3000" \
        -v "$VOLUME_NAME:/app/data" \
        "$IMAGE_NAME:latest"

    echo ""
    echo -e "${GREEN}✓ Jack The Butler is running!${NC}"
    echo ""
    echo "==========================================="
    echo -e "Dashboard: ${BLUE}http://localhost:${PORT}${NC}"
    echo ""
    echo -e "Email:    ${BOLD}admin@butler.com${NC}"
    echo -e "Password: ${BOLD}pa\$\$word2026${NC}"
    echo "==========================================="
    echo ""
    echo "Next steps:"
    echo "  1. Open the dashboard in your browser"
    echo "  2. Log in with the credentials above"
    echo "  3. Configure your AI provider in Engine > Apps"
    echo "  4. Start chatting with guests!"
    echo ""
    echo "Commands:"
    echo "  Stop:    docker stop $CONTAINER_NAME"
    echo "  Start:   docker start $CONTAINER_NAME"
    echo "  Logs:    docker logs -f $CONTAINER_NAME"
    echo "  Remove:  docker rm -f $CONTAINER_NAME"
    echo ""
}

# Main
main() {
    if ! check_docker; then
        install_docker
    fi

    check_docker_running
    stop_existing
    run_jack
}

main
