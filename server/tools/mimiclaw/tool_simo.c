/**
 * Simo 机器人控制工具实现
 * 
 * 依赖：
 * - esp_http_client (ESP-IDF)
 * - cJSON
 */

#include "tool_simo.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include <string.h>
#include <stdlib.h>

static const char *TAG = "tool_simo";
static char simo_server_url[128] = "http://192.168.1.100:3001";

// HTTP 响应缓冲区
#define HTTP_RESPONSE_BUFFER_SIZE 2048
static char http_response_buffer[HTTP_RESPONSE_BUFFER_SIZE];
static int http_response_len = 0;

/**
 * HTTP 事件处理
 */
static esp_err_t http_event_handler(esp_http_client_event_t *evt) {
    switch (evt->event_id) {
        case HTTP_EVENT_ON_DATA:
            if (http_response_len + evt->data_len < HTTP_RESPONSE_BUFFER_SIZE) {
                memcpy(http_response_buffer + http_response_len, evt->data, evt->data_len);
                http_response_len += evt->data_len;
            }
            break;
        default:
            break;
    }
    return ESP_OK;
}

/**
 * 发送 POST 请求到 Simo API
 */
static char* simo_post_request(const char *endpoint, const char *json_body) {
    char url[256];
    snprintf(url, sizeof(url), "%s%s", simo_server_url, endpoint);
    
    // 重置响应缓冲区
    memset(http_response_buffer, 0, HTTP_RESPONSE_BUFFER_SIZE);
    http_response_len = 0;
    
    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .event_handler = http_event_handler,
        .timeout_ms = 5000
    };
    
    esp_http_client_handle_t client = esp_http_client_init(&config);
    
    // 设置 headers
    esp_http_client_set_header(client, "Content-Type", "application/json");
    
    // 发送请求
    esp_http_client_set_post_field(client, json_body, strlen(json_body));
    esp_err_t err = esp_http_client_perform(client);
    
    char *result = NULL;
    if (err == ESP_OK) {
        int status_code = esp_http_client_get_status_code(client);
        ESP_LOGI(TAG, "POST %s -> %d (%d bytes)", endpoint, status_code, http_response_len);
        
        if (status_code == 200 && http_response_len > 0) {
            // 复制响应到堆上
            result = malloc(http_response_len + 1);
            if (result) {
                memcpy(result, http_response_buffer, http_response_len);
                result[http_response_len] = '\0';
            }
        } else {
            // 错误响应
            result = malloc(128);
            if (result) {
                snprintf(result, 128, "{\"error\":\"HTTP %d\"}", status_code);
            }
        }
    } else {
        ESP_LOGE(TAG, "HTTP POST failed: %s", esp_err_to_name(err));
        result = malloc(128);
        if (result) {
            snprintf(result, 128, "{\"error\":\"Request failed: %s\"}", esp_err_to_name(err));
        }
    }
    
    esp_http_client_cleanup(client);
    return result;
}

/**
 * 发送 GET 请求到 Simo API
 */
static char* simo_get_request(const char *endpoint) {
    char url[256];
    snprintf(url, sizeof(url), "%s%s", simo_server_url, endpoint);
    
    memset(http_response_buffer, 0, HTTP_RESPONSE_BUFFER_SIZE);
    http_response_len = 0;
    
    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_GET,
        .event_handler = http_event_handler,
        .timeout_ms = 5000
    };
    
    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_err_t err = esp_http_client_perform(client);
    
    char *result = NULL;
    if (err == ESP_OK) {
        int status_code = esp_http_client_get_status_code(client);
        ESP_LOGI(TAG, "GET %s -> %d (%d bytes)", endpoint, status_code, http_response_len);
        
        if (status_code == 200 && http_response_len > 0) {
            result = malloc(http_response_len + 1);
            if (result) {
                memcpy(result, http_response_buffer, http_response_len);
                result[http_response_len] = '\0';
            }
        }
    }
    
    if (!result) {
        result = malloc(64);
        if (result) {
            snprintf(result, 64, "{\"error\":\"GET failed\"}");
        }
    }
    
    esp_http_client_cleanup(client);
    return result;
}

/**
 * 初始化 Simo 工具模块
 */
void tool_simo_init(const char *server_url) {
    if (server_url) {
        strncpy(simo_server_url, server_url, sizeof(simo_server_url) - 1);
        simo_server_url[sizeof(simo_server_url) - 1] = '\0';
    }
    ESP_LOGI(TAG, "Simo tool initialized, server: %s", simo_server_url);
}

/**
 * simo_move 工具实现
 */
char* tool_simo_move(cJSON *args_json) {
    const char *direction = cJSON_GetObjectItem(args_json, "direction")->valuestring;
    int duration_ms = cJSON_GetObjectItem(args_json, "duration_ms") 
                      ? cJSON_GetObjectItem(args_json, "duration_ms")->valueint 
                      : 800;
    
    // 构建请求 JSON
    cJSON *req = cJSON_CreateObject();
    cJSON_AddStringToObject(req, "intent", "MOVE");
    cJSON_AddStringToObject(req, "direction", direction);
    cJSON_AddNumberToObject(req, "duration_ms", duration_ms);
    cJSON_AddStringToObject(req, "source", "mimiclaw");
    
    char *req_str = cJSON_PrintUnformatted(req);
    char *result = simo_post_request("/api/intent/execute", req_str);
    
    cJSON_Delete(req);
    free(req_str);
    
    return result;
}

/**
 * simo_turn 工具实现
 */
char* tool_simo_turn(cJSON *args_json) {
    const char *direction = cJSON_GetObjectItem(args_json, "direction")->valuestring;
    int duration_ms = cJSON_GetObjectItem(args_json, "duration_ms")
                      ? cJSON_GetObjectItem(args_json, "duration_ms")->valueint
                      : 800;
    
    cJSON *req = cJSON_CreateObject();
    cJSON_AddStringToObject(req, "intent", "TURN");
    cJSON_AddStringToObject(req, "direction", direction);
    cJSON_AddNumberToObject(req, "duration_ms", duration_ms);
    cJSON_AddStringToObject(req, "source", "mimiclaw");
    
    char *req_str = cJSON_PrintUnformatted(req);
    char *result = simo_post_request("/api/intent/execute", req_str);
    
    cJSON_Delete(req);
    free(req_str);
    
    return result;
}

/**
 * simo_stop 工具实现
 */
char* tool_simo_stop(cJSON *args_json) {
    (void)args_json;  // 未使用
    return simo_post_request("/api/intent/stop", "{}");
}

/**
 * simo_status 工具实现
 */
char* tool_simo_status(cJSON *args_json) {
    (void)args_json;  // 未使用
    return simo_get_request("/api/state");
}

/**
 * 获取工具定义（用于注册到 tool_registry）
 */
cJSON* tool_simo_get_definitions(void) {
    cJSON *tools = cJSON_CreateArray();
    
    // simo_move
    cJSON *move_tool = cJSON_CreateObject();
    cJSON_AddStringToObject(move_tool, "name", "simo_move");
    cJSON_AddStringToObject(move_tool, "description", 
        "控制 Simo 机器人移动。前进或后退指定时长。如检测到障碍物会被安全系统阻止。");
    
    cJSON *move_schema = cJSON_CreateObject();
    cJSON_AddStringToObject(move_schema, "type", "object");
    
    cJSON *move_props = cJSON_CreateObject();
    cJSON *direction = cJSON_CreateObject();
    cJSON_AddStringToObject(direction, "type", "string");
    cJSON *dir_enum = cJSON_CreateArray();
    cJSON_AddItemToArray(dir_enum, cJSON_CreateString("F"));
    cJSON_AddItemToArray(dir_enum, cJSON_CreateString("B"));
    cJSON_AddItemToObject(direction, "enum", dir_enum);
    cJSON_AddStringToObject(direction, "description", "移动方向：F=前进，B=后退");
    cJSON_AddItemToObject(move_props, "direction", direction);
    
    cJSON *duration = cJSON_CreateObject();
    cJSON_AddStringToObject(duration, "type", "integer");
    cJSON *dur_enum = cJSON_CreateArray();
    cJSON_AddItemToArray(dur_enum, cJSON_CreateNumber(400));
    cJSON_AddItemToArray(dur_enum, cJSON_CreateNumber(800));
    cJSON_AddItemToArray(dur_enum, cJSON_CreateNumber(1200));
    cJSON_AddItemToObject(duration, "enum", dur_enum);
    cJSON_AddStringToObject(duration, "description", "移动时长（毫秒）");
    cJSON_AddItemToObject(move_props, "duration_ms", duration);
    
    cJSON_AddItemToObject(move_schema, "properties", move_props);
    cJSON *move_required = cJSON_CreateArray();
    cJSON_AddItemToArray(move_required, cJSON_CreateString("direction"));
    cJSON_AddItemToObject(move_schema, "required", move_required);
    
    cJSON_AddItemToObject(move_tool, "input_schema", move_schema);
    cJSON_AddItemToArray(tools, move_tool);
    
    // simo_turn
    cJSON *turn_tool = cJSON_CreateObject();
    cJSON_AddStringToObject(turn_tool, "name", "simo_turn");
    cJSON_AddStringToObject(turn_tool, "description", "控制 Simo 机器人转向。左转或右转指定时长。");
    
    cJSON *turn_schema = cJSON_CreateObject();
    cJSON_AddStringToObject(turn_schema, "type", "object");
    
    cJSON *turn_props = cJSON_CreateObject();
    cJSON *turn_dir = cJSON_CreateObject();
    cJSON_AddStringToObject(turn_dir, "type", "string");
    cJSON *turn_dir_enum = cJSON_CreateArray();
    cJSON_AddItemToArray(turn_dir_enum, cJSON_CreateString("L"));
    cJSON_AddItemToArray(turn_dir_enum, cJSON_CreateString("R"));
    cJSON_AddItemToObject(turn_dir, "enum", turn_dir_enum);
    cJSON_AddStringToObject(turn_dir, "description", "转向方向：L=左转，R=右转");
    cJSON_AddItemToObject(turn_props, "direction", turn_dir);
    
    cJSON *turn_duration = cJSON_CreateObject();
    cJSON_AddStringToObject(turn_duration, "type", "integer");
    cJSON *turn_dur_enum = cJSON_CreateArray();
    cJSON_AddItemToArray(turn_dur_enum, cJSON_CreateNumber(400));
    cJSON_AddItemToArray(turn_dur_enum, cJSON_CreateNumber(800));
    cJSON_AddItemToArray(turn_dur_enum, cJSON_CreateNumber(1200));
    cJSON_AddItemToObject(turn_duration, "enum", turn_dur_enum);
    cJSON_AddStringToObject(turn_duration, "description", "转向时长（毫秒）");
    cJSON_AddItemToObject(turn_props, "duration_ms", turn_duration);
    
    cJSON_AddItemToObject(turn_schema, "properties", turn_props);
    cJSON *turn_required = cJSON_CreateArray();
    cJSON_AddItemToArray(turn_required, cJSON_CreateString("direction"));
    cJSON_AddItemToObject(turn_schema, "required", turn_required);
    
    cJSON_AddItemToObject(turn_tool, "input_schema", turn_schema);
    cJSON_AddItemToArray(tools, turn_tool);
    
    // simo_stop
    cJSON *stop_tool = cJSON_CreateObject();
    cJSON_AddStringToObject(stop_tool, "name", "simo_stop");
    cJSON_AddStringToObject(stop_tool, "description", "紧急停止 Simo 机器人所有动作。此命令最高优先级。");
    cJSON *stop_schema = cJSON_CreateObject();
    cJSON_AddStringToObject(stop_schema, "type", "object");
    cJSON_AddItemToObject(stop_schema, "properties", cJSON_CreateObject());
    cJSON_AddItemToObject(stop_tool, "input_schema", stop_schema);
    cJSON_AddItemToArray(tools, stop_tool);
    
    // simo_status
    cJSON *status_tool = cJSON_CreateObject();
    cJSON_AddStringToObject(status_tool, "name", "simo_status");
    cJSON_AddStringToObject(status_tool, "description", "查询 Simo 机器人当前状态：运动状态、安全状态、传感器数据等。");
    cJSON *status_schema = cJSON_CreateObject();
    cJSON_AddStringToObject(status_schema, "type", "object");
    cJSON_AddItemToObject(status_schema, "properties", cJSON_CreateObject());
    cJSON_AddItemToObject(status_tool, "input_schema", status_schema);
    cJSON_AddItemToArray(tools, status_tool);
    
    return tools;
}
