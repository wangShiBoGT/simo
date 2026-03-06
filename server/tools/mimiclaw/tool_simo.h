/**
 * Simo 机器人控制工具（MimiClaw 集成）
 * 
 * 使用方法：
 * 1. 将此文件复制到 MimiClaw 项目的 main/tools/ 目录
 * 2. 在 main/tools/tool_registry.c 中注册此工具
 * 3. 配置 Simo 服务器地址（默认 http://192.168.1.100:3001）
 * 
 * 功能：
 * - simo_move: 控制 Simo 前进/后退
 * - simo_turn: 控制 Simo 左转/右转
 * - simo_stop: 紧急停止
 * - simo_status: 查询状态
 */

#ifndef TOOL_SIMO_H
#define TOOL_SIMO_H

#include <stddef.h>
#include "cJSON.h"

/**
 * 初始化 Simo 工具模块
 * @param server_url Simo 服务器地址，如 "http://192.168.1.100:3001"
 */
void tool_simo_init(const char *server_url);

/**
 * 执行 simo_move 工具
 * @param args_json 参数 JSON，格式: {"direction": "F"|"B", "duration_ms": 400|800|1200}
 * @return 结果 JSON 字符串（调用者需要 free）
 */
char* tool_simo_move(cJSON *args_json);

/**
 * 执行 simo_turn 工具
 * @param args_json 参数 JSON，格式: {"direction": "L"|"R", "duration_ms": 400|800|1200}
 * @return 结果 JSON 字符串（调用者需要 free）
 */
char* tool_simo_turn(cJSON *args_json);

/**
 * 执行 simo_stop 工具
 * @param args_json 参数 JSON（忽略）
 * @return 结果 JSON 字符串（调用者需要 free）
 */
char* tool_simo_stop(cJSON *args_json);

/**
 * 执行 simo_status 工具
 * @param args_json 参数 JSON（忽略）
 * @return 结果 JSON 字符串（调用者需要 free）
 */
char* tool_simo_status(cJSON *args_json);

/**
 * 获取 Simo 工具定义数组（用于 tool_registry）
 * @return cJSON 数组对象（调用者需要 cJSON_Delete）
 */
cJSON* tool_simo_get_definitions(void);

#endif // TOOL_SIMO_H
