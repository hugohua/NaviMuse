#!/bin/bash

# Docker 构建和导出脚本
# 用途：构建 Docker 镜像并将构建产物导出到 dockers 目录
# 用法: ./build-and-export.sh [版本号]
# 示例: ./build-and-export.sh v1.0.0
#        ./build-and-export.sh latest

set -e  # 遇到错误时退出

# 代理配置
PROXY_HOST="http://127.0.0.1:1087"
NO_PROXY_VALUE="localhost,127.0.0.1,*.internal,192.168.0.0/16,10.*.*.*"

# 保存当前代理设置
OLD_HTTP_PROXY="${http_proxy:-}"
OLD_HTTPS_PROXY="${https_proxy:-}"
OLD_NO_PROXY="${no_proxy:-}"

# 恢复代理设置的函数
restore_proxy() {
    if [ -n "$OLD_HTTP_PROXY" ]; then
        export http_proxy="$OLD_HTTP_PROXY"
    else
        unset http_proxy
    fi
    
    if [ -n "$OLD_HTTPS_PROXY" ]; then
        export https_proxy="$OLD_HTTPS_PROXY"
    else
        unset https_proxy
    fi
    
    if [ -n "$OLD_NO_PROXY" ]; then
        export no_proxy="$OLD_NO_PROXY"
    else
        unset no_proxy
    fi
}

# 设置代理
setup_proxy() {
    export http_proxy="$PROXY_HOST"
    export https_proxy="$PROXY_HOST"
    export no_proxy="$NO_PROXY_VALUE"
}

# 使用 trap 确保脚本退出时恢复代理（无论成功还是失败）
trap restore_proxy EXIT

# 获取版本号参数
VERSION="${1:-latest}"

# 配置
IMAGE_NAME="baofen14787/navimuse:${VERSION}"
OUTPUT_DIR="dockers"
OUTPUT_FILE="${OUTPUT_DIR}/navimuse-${VERSION}.tar"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# 显示使用信息
print_usage() {
    echo -e "${BLUE}用法:${NC} $0 [版本号]"
    echo -e "${BLUE}示例:${NC} $0 v1.0.0"
    echo -e "       $0 latest"
    echo -e "       $0 1.2.3"
}

# 如果传递了帮助参数
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    print_usage
    exit 0
fi

# 显示使用的版本号
print_info "使用版本号: ${VERSION}"
print_info "镜像名称: ${IMAGE_NAME}"
print_info "输出文件: ${OUTPUT_FILE}"
echo ""

# 设置代理
print_info "设置代理: ${PROXY_HOST}"
setup_proxy

# 确保输出目录存在
if [ ! -d "$OUTPUT_DIR" ]; then
    print_info "创建输出目录: $OUTPUT_DIR"
    mkdir -p "$OUTPUT_DIR"
fi

# 步骤1: 构建 Docker 镜像 (使用优化版 Dockerfile,支持多阶段构建和 BuildKit 缓存)
print_info "开始构建 Docker 镜像: $IMAGE_NAME"
print_info "启用 BuildKit 以支持缓存挂载..."

# 启用 BuildKit 并显示详细构建日志
if DOCKER_BUILDKIT=1 docker build \
    --platform linux/amd64 \
    --progress=plain \
    -t "$IMAGE_NAME" .; then
    print_info "Docker 镜像构建成功！"
else
    print_error "Docker 镜像构建失败！"
    exit 1
fi

# 步骤2: 导出 Docker 镜像
print_info "开始导出 Docker 镜像到: $OUTPUT_FILE"
if docker save "$IMAGE_NAME" -o "$OUTPUT_FILE"; then
    # 获取文件大小
    FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
    print_info "Docker 镜像导出成功！"
    print_info "文件位置: $OUTPUT_FILE"
    print_info "文件大小: $FILE_SIZE"
else
    print_error "Docker 镜像导出失败！"
    exit 1
fi

print_info "所有操作完成！"
# 注意：代理设置已通过 trap EXIT 自动恢复

